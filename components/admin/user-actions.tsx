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

type Target = {
  id: string;
  email: string;
  role: "admin" | "user";
  suspended: boolean;
  plan: string;
  quotaTokens: number | null;
  self: boolean;
};

export function UserActions({ user }: { user: Target }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);

  function perform<T extends object>(action: () => Promise<ActionResult<T>>, onDone?: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else onDone?.(result);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error ? <span className="max-w-48 text-right text-xs text-destructive">{error}</span> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={user.self}
            onSelect={() => perform(() => setUserRole(user.id, user.role === "admin" ? "user" : "admin"))}
          >
            {user.role === "admin" ? "Change role to user" : "Change role to admin"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setQuotaOpen(true)}>Adjust plan and quota</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (!window.confirm(`Reset the password for ${user.email}? They will be signed out everywhere.`)) return;
              perform(() => resetUserPassword(user.id), (result) => setPassword(result.password));
            }}
          >
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={user.suspended ? "default" : "destructive"}
            disabled={user.self}
            onSelect={() => {
              if (!user.suspended && !window.confirm(`Suspend ${user.email}? They will be signed out and cannot sign in.`)) return;
              perform(() => setUserSuspended(user.id, !user.suspended));
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
          perform(() => updateUserQuota(user.id, input), () => setQuotaOpen(false))
        }
        pending={pending}
        error={error}
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
  error,
}: {
  user: Target;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { plan: string; quotaTokens: number | null; resetUsage: boolean }) => void;
  pending: boolean;
  error: string | null;
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
