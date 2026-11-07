"use client";

import { useTransition } from "react";
import { Flag, FlagOff, Trash } from "lucide-react";
import { deleteMessage, flagMessage } from "@/app/admin/actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";

export function MessageActions({ id, flagged }: { id: string; flagged: boolean }) {
  const [pending, startTransition] = useTransition();
  const { confirm, prompt, report } = useFeedback();

  function perform(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      report(await action(), { title: success });
    });
  }

  return (
    <div className="flex items-center gap-1">
      {flagged ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => perform(() => flagMessage(id, false, ""), "Flag removed")}
        >
          <FlagOff />
          Unflag
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            const reason = await prompt({
              title: "Flag this message?",
              description: "Flagged messages are listed for review in the admin panel.",
              label: "Reason (optional)",
              placeholder: "Why are you flagging it?",
              confirmLabel: "Flag",
              maxLength: 300,
            });
            if (reason === null) return;
            perform(() => flagMessage(id, true, reason), "Message flagged");
          }}
        >
          <Flag />
          Flag
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "Delete this message?",
            description: "The message is removed permanently. This cannot be undone.",
            confirmLabel: "Delete",
            destructive: true,
          });
          if (ok) perform(() => deleteMessage(id), "Message deleted");
        }}
      >
        <Trash />
        Delete
      </Button>
    </div>
  );
}
