"use client";

import { useState, useTransition } from "react";
import { Copy, MoreHorizontal } from "lucide-react";
import {
  resetUserPassword,
  setUserRole,
  setUserSuspended,
  updateUserQuota,
  type ActionResult,
} from "@/app/admin/actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isStaff, ROLE_LABEL, ROLES, type Role, type StaffRole } from "@/lib/roles";

type Target = {
  id: string;
  email: string;
  role: Role;
  suspended: boolean;
  plan: string;
  quotaTokens: number | null;
  self: boolean;
};

const ROLE_ARTICLE: Record<Role, string> = {
  superadmin: "a Super Administrator",
  admin: "an Administrator",
  user: "a regular user",
};

const ROLE_EFFECT: Record<Role, string> = {
  superadmin: "Super Administrators can manage every account, including other admins, and all security settings.",
  admin: "Admins can manage regular users, conversations and settings, but not other admin accounts.",
  user: "They lose access to the admin panel immediately.",
};

export function UserActions({ user, viewerRole }: { user: Target; viewerRole: StaffRole }) {
  const locked = isStaff(user.role) && viewerRole !== "superadmin";
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const { confirm, report } = useFeedback();

  function perform<T extends object>(
    action: () => Promise<ActionResult<T>>,
    success: string | null,
    onDone?: (result: T) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (report(result, success ? { title: success } : undefined) && result.ok) onDone?.(result);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{user.email}</DropdownMenuLabel>
          {viewerRole === "superadmin" && !user.self
            ? ROLES.filter((role) => role !== user.role).map((role) => (
                <DropdownMenuItem
                  key={role}
                  onSelect={async () => {
                    const ok = await confirm({
                      title: `Make ${user.email} ${ROLE_ARTICLE[role]}?`,
                      description: ROLE_EFFECT[role],
                      confirmLabel: "Change role",
                      destructive: role === "superadmin",
                    });
                    if (ok) perform(() => setUserRole(user.id, role), "Role updated");
                  }}
                >
                  Change role to {ROLE_LABEL[role]}
                </DropdownMenuItem>
              ))
            : null}
          {locked ? (
            <DropdownMenuItem disabled>Only a Super Administrator can change this account</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={locked} onSelect={() => setQuotaOpen(true)}>
            Adjust plan and quota
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={locked}
            onSelect={async () => {
              const ok = await confirm({
                title: "Reset password?",
                description: `${user.email} gets a temporary password, is signed out everywhere, and must choose a new password at next sign-in.`,
                confirmLabel: "Reset password",
                destructive: true,
              });
              if (ok) perform(() => resetUserPassword(user.id), null, (result) => setPassword(result.password));
            }}
          >
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={user.suspended ? "default" : "destructive"}
            disabled={user.self || locked}
            onSelect={async () => {
              const ok = await confirm(
                user.suspended
                  ? { title: "Reactivate account?", description: `${user.email} can sign in again.`, confirmLabel: "Reactivate" }
                  : {
                      title: "Suspend account?",
                      description: `${user.email} is signed out and cannot sign in until reactivated.`,
                      confirmLabel: "Suspend",
                      destructive: true,
                    },
              );
              if (ok) perform(() => setUserSuspended(user.id, !user.suspended), user.suspended ? "Account reactivated" : "Account suspended");
            }}
          >
            {user.suspended ? "Reactivate" : "Suspend"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={password !== null} onOpenChange={(open) => !open && setPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Give this to {user.email}. It is shown only once, and their other sessions were signed out.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={password ?? ""} className="h-10 font-mono" onFocus={(event) => event.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void navigator.clipboard?.writeText(password ?? "")}
            >
              <Copy />
              Copy
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuotaDialog
        user={user}
        open={quotaOpen}
        onOpenChange={setQuotaOpen}
        onSave={(input) =>
          perform(() => updateUserQuota(user.id, input), "Plan and quota saved", () => setQuotaOpen(false))
        }
        pending={pending}
      />
    </div>
  );
}

function QuotaDialog({
  user,
  open,
  onOpenChange,
  onSave,
  pending,
}: {
  user: Target;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { plan: string; quotaTokens: number | null; resetUsage: boolean }) => void;
  pending: boolean;
}) {
  const [resetUsage, setResetUsage] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const raw = String(form.get("quota") ?? "").replace(/[,\s_]/g, "");
            onSave({
              plan: String(form.get("plan") ?? "").trim(),
              quotaTokens: raw === "" ? null : Number(raw),
              resetUsage,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Plan and quota</DialogTitle>
            <DialogDescription>{user.email}. The quota is a monthly token allowance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`plan-${user.id}`}>Plan</Label>
            <Input id={`plan-${user.id}`} name="plan" defaultValue={user.plan} required maxLength={40} className="h-10" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`quota-${user.id}`}>Monthly token limit</Label>
            <Input
              id={`quota-${user.id}`}
              name="quota"
              inputMode="numeric"
              defaultValue={user.quotaTokens ?? ""}
              placeholder="Unlimited"
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">Leave empty for unlimited. 0 blocks chatting.</p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            Reset this month&apos;s usage to zero
            <Switch checked={resetUsage} onCheckedChange={setResetUsage} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
