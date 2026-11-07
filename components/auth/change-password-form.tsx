"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm({ next, cancellable }: { next: string; cancellable: boolean }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const fail = (description: string) => void notify({ tone: "error", title: "Password not changed", description });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("current") ?? "");
    const newPassword = String(form.get("new") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      fail("The new passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!response.ok || !data.email) {
        fail(data.error ?? "Could not change the password.");
        setPending(false);
        return;
      }
      // The change signed out every session, this one included; sign back in with the new password.
      const result = await signIn("credentials", { email: data.email, password: newPassword, redirect: false });
      if (result?.error) {
        router.replace("/login");
        return;
      }
      // A full load: the client router may still hold the redirect to this page from before the change.
      window.location.replace(next);
    } catch {
      fail("Could not reach the server. Check your connection.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">New password</Label>
        <Input id="new" name="new" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
        <p className="text-xs text-muted-foreground">At least 8 characters, different from the current one.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
      <div className="flex justify-between text-sm text-muted-foreground">
        {cancellable ? (
          <Link href={next} className="underline">
            Cancel
          </Link>
        ) : (
          <span />
        )}
        <button type="button" className="underline" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </button>
      </div>
    </form>
  );
}
