"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { useFeedback } from "@/components/feedback";
import { Row } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountTab() {
  const router = useRouter();
  const { user } = useChatChrome();
  const { confirm, prompt, notify, toast } = useFeedback();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const usage = user.usage;

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
      await signOut({ callbackUrl: "/" });
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
      <Row label="Email">
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </Row>
      <Row label="Role">
        <span className="text-sm text-muted-foreground capitalize">{user.role}</span>
      </Row>
      <Row label="Member since">
        <span className="text-sm text-muted-foreground">
          {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </span>
      </Row>
      <Row
        label="Usage this month"
        description={usage.limit === null ? "No monthly limit on this account." : "Resets on the 1st of each month."}
      >
        <span className="text-sm text-muted-foreground" data-usage>
          {usage.used.toLocaleString()} {usage.limit === null ? "" : `of ${usage.limit.toLocaleString()} `}tokens
        </span>
      </Row>
      <Row label="Delete account" description="Permanently deletes your account and everything in it.">
        <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAccount()}>
          Delete account
        </Button>
      </Row>
    </div>
  );
}
