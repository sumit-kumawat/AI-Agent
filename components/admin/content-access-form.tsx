"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { requestConversationAccess } from "@/app/admin/actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ContentAccessForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { report } = useFeedback();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-2xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          if (report(await requestConversationAccess(conversationId, reason))) router.refresh();
        });
      }}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <h2 className="font-medium">Messages are private</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            State why you need to read this conversation (for example, an abuse report or a support request from the
            user). Your reason is recorded in the audit log and unlocks this chat for 30 minutes.
          </p>
        </div>
      </div>
      <label className="mt-4 grid gap-1.5 text-sm">
        <span className="font-medium">Reason</span>
        <Textarea
          name="reason"
          value={reason}
          minLength={10}
          maxLength={500}
          rows={3}
          required
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={pending || reason.trim().length < 10}>
          {pending ? "Recording…" : "Record reason and view"}
        </Button>
      </div>
    </form>
  );
}
