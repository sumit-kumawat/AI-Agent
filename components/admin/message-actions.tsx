"use client";

import { useState, useTransition } from "react";
import { Flag, FlagOff, Trash } from "lucide-react";
import { deleteMessage, flagMessage } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export function MessageActions({ id, flagged }: { id: string; flagged: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function perform(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex items-center gap-1">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      {flagged ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => perform(() => flagMessage(id, false, ""))}>
          <FlagOff />
          Unflag
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt("Why are you flagging this message? (optional)");
            if (reason === null) return;
            perform(() => flagMessage(id, true, reason));
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
        onClick={() => {
          if (!window.confirm("Delete this message permanently? This cannot be undone.")) return;
          perform(() => deleteMessage(id));
        }}
      >
        <Trash />
        Delete
      </Button>
    </div>
  );
}
