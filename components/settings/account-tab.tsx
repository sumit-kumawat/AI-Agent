"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { useFeedback } from "@/components/feedback";
import { Row } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatReset } from "@/lib/plans/types";
import { ROLE_LABEL } from "@/lib/roles";

export function AccountTab() {
  const router = useRouter();
  const { user, usage } = useChatChrome();
  const { confirm, prompt, notify, toast } = useFeedback();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const monthly = usage.windows.find((window) => window.window === "monthly");

  async function saveName() {
    setSaving(true);
    try {
      await jsonFetch("/api/account/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      toast("Name updated");
      router.refresh();
    } catch (error) {
      void notify({ tone: "error", title: "Could not save", description: (error as Error).message });
    }
    setSaving(false);
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete your account?",
      description:
        "Your account, chats, memories and preferences will be permanently deleted. Export your data first if you want a copy.",
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!ok) return;
    const password = await prompt({
      title: "Confirm with your password",
      label: "Password",
      type: "password",
      confirmLabel: "Delete account",
      destructive: true,
      maxLength: 200,
    });
    if (!password) return;
    try {
      await jsonFetch("/api/account", { method: "DELETE", body: JSON.stringify({ password }) });
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      void notify({ tone: "error", title: "Account not deleted", description: (error as Error).message });
    }
  }

  return (
    <div>
      <form
        className="flex flex-col gap-2 border-b py-3.5 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && name.trim() !== user.name) void saveName();
        }}
      >
        <label className="grid flex-1 gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </label>
        <Button type="submit" variant="outline" disabled={saving || !name.trim() || name.trim() === user.name}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
      <Row label="User ID" description="Quote this when you contact support. It never changes.">
        <span className="font-mono text-sm text-muted-foreground" data-public-id>
          {user.publicId}
        </span>
      </Row>
      <Row label="Username" description="Assigned automatically. You can sign in with it or your email.">
        <span className="font-mono text-sm text-muted-foreground" data-username>
          {user.username}
        </span>
      </Row>
      <Row label="Email">
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </Row>
      <Row label="Role">
        <span className="text-sm text-muted-foreground">{ROLE_LABEL[user.role]}</span>
      </Row>
      <Row label="Member since">
        <span className="text-sm text-muted-foreground">
          {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </span>
      </Row>
      <Row label="Plan" description={usage.staff ? "Administrators are not limited by plans." : "Compare plans to see what each includes."}>
        <Link href="/plans" className="text-sm font-medium underline-offset-4 hover:underline" data-plan={usage.plan.id}>
          {usage.plan.name}
        </Link>
      </Row>
      <Row label="Usage this month" description={monthly && monthly.limit !== 0 ? `Resets ${formatReset(monthly.resetAt)}.` : "No monthly limit on this account."}>
        <Link href="/usage" className="text-sm text-muted-foreground underline-offset-4 hover:underline" data-usage>
          {monthly ? `${monthly.used.toLocaleString()} ${monthly.limit === 0 ? "" : `of ${monthly.limit.toLocaleString()} `}tokens` : "—"}
        </Link>
      </Row>
      <Row label="Delete account" description="Permanently deletes your account and everything in it.">
        <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAccount()}>
          Delete account
        </Button>
      </Row>
    </div>
  );
}
