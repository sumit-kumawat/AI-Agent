"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { useFeedback } from "@/components/feedback";
import { Row } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";

export function SecurityTab() {
  const { confirm, notify } = useFeedback();

  async function signOutEverywhere() {
    const ok = await confirm({
      title: "Log out of all devices?",
      description: "Every session, including this one, will be signed out. You will need to log in again.",
      confirmLabel: "Log out everywhere",
      destructive: true,
    });
    if (!ok) return;
    try {
      await jsonFetch("/api/account/sessions", { method: "DELETE" });
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      void notify({ tone: "error", title: "That did not work", description: (error as Error).message });
    }
  }

  return (
    <div>
      <Row label="Password" description="Changing it signs you out on every device.">
        <Button asChild variant="outline" size="sm">
          <Link href="/account/password">Change password</Link>
        </Button>
      </Row>
      <Row label="Log out of all devices" description="Use this if you signed in on a device you no longer control.">
        <Button type="button" variant="outline" size="sm" onClick={() => void signOutEverywhere()}>
          Log out all
        </Button>
      </Row>
      <Row label="Log out" description="Ends the session in this browser.">
        <Button type="button" variant="outline" size="sm" onClick={() => void signOut({ callbackUrl: "/login" })}>
          Log out
        </Button>
      </Row>
    </div>
  );
}
