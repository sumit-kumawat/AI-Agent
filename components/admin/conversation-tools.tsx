"use client";

import { CalendarClock, FileDown, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteConversations, previewConversationDelete, previewRetention, saveConversationRetention } from "@/app/admin/actions";
import { useSelection } from "@/components/admin/selection";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationSummary } from "@/lib/admin/conversations";
import { formatBytes, formatNumber } from "@/lib/format";

export function BulkConversationActions() {
  const { selected, clear } = useSelection();
  const [dialog, setDialog] = useState<"delete" | "export" | null>(null);
  const ids = [...selected];
  if (ids.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm" data-bulk-actions>
      <span className="font-medium">{ids.length} selected</span>
      <Button size="sm" variant="outline" onClick={() => setDialog("export")} data-bulk="export">
        <FileDown /> Export…
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setDialog("delete")} data-bulk="delete">
        <Trash2 /> Delete…
      </Button>
      <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={clear} aria-label="Clear selection" title="Clear selection">
        <X />
      </Button>
      <DeleteDialog ids={ids} open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)} onDone={clear} />
      <ExportDialog ids={ids} open={dialog === "export"} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}

function DeleteDialog({ ids, open, onOpenChange, onDone }: { ids: string[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const router = useRouter();
  const { report } = useFeedback();
  const [preview, setPreview] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const key = ids.join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    started.current = false;
    void previewConversationDelete(key.split(",")).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.conversations);
        setError(null);
      } else setError(result.error);
    });
    return () => {
      cancelled = true;
      setPreview(null);
      setTyped("");
    };
  }, [open, key]);

  const sum = (pick: (row: ConversationSummary) => number) => (preview ?? []).reduce((total, row) => total + pick(row), 0);
  const owners = new Set((preview ?? []).map((row) => row.email));

  async function execute() {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    const result = await deleteConversations({ ids, confirmation: typed });
    setRunning(false);
    if (result.ok) {
      report(result, { title: `${result.deleted} conversation${result.deleted === 1 ? "" : "s"} deleted`, description: "Usage records were kept and each deletion is in the audit log." });
      onOpenChange(false);
      onDone();
      router.refresh();
    } else {
      started.current = false;
      report(result);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" data-conversation-delete>
        <DialogHeader>
          <DialogTitle>Delete {ids.length === 1 ? "this conversation" : `${ids.length} conversations`}?</DialogTitle>
          <DialogDescription>The chats disappear for their owners too. This cannot be undone.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : preview === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Counting what is affected…
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <ul className="divide-y rounded-lg border" data-cleanup-preview>
              <li className="flex justify-between px-3 py-1.5">
                <span>Conversations</span>
                <span data-affected="conversations">
                  {formatNumber(preview.length)} from {formatNumber(owners.size)} user{owners.size === 1 ? "" : "s"}
                </span>
              </li>
              <li className="flex justify-between px-3 py-1.5">
                <span>Messages</span>
                <span data-affected="messages">{formatNumber(sum((row) => row.messages))}</span>
              </li>
              <li className="flex justify-between px-3 py-1.5">
                <span>Attached files</span>
                <span data-affected="attachments">
                  {formatNumber(sum((row) => row.attachments))} ({formatBytes(sum((row) => row.attachmentBytes))})
                </span>
              </li>
            </ul>
            <p className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" /> Token usage records stay for accounting. The audit log records each deletion without message text.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="conversation-confirm">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
              </Label>
              <Input id="conversation-confirm" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void execute()}
            disabled={running || !preview?.length || typed.trim() !== "DELETE"}
            data-conversation-confirm
          >
            {running ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportDialog({ ids, open, onOpenChange }: { ids: string[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/conversations/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        void notify({ tone: "error", title: "Export failed", description: body?.error ?? `The server answered ${response.status}.` });
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "conversations.json";
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      URL.revokeObjectURL(url);
      void notify({ tone: "success", title: "Export downloaded", description: `${ids.length} conversation${ids.length === 1 ? "" : "s"}; the reason is in the audit log.` });
      setReason("");
      onOpenChange(false);
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" data-conversation-export>
        <DialogHeader>
          <DialogTitle>Export {ids.length === 1 ? "this conversation" : `${ids.length} conversations`}</DialogTitle>
          <DialogDescription>
            Downloads a JSON file with the messages and the names and sizes of attached files. Exporting reads message text, so it needs a reason,
            recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="export-reason">Reason</Label>
          <Textarea id="export-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: data request from the account owner, ticket 1234" rows={3} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void run()} disabled={running || reason.trim().length < 10} data-export-confirm>
            {running ? <Loader2 className="animate-spin" /> : <FileDown />} Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RetentionForm({ days: saved }: { days: number }) {
  const router = useRouter();
  const { confirm, report } = useFeedback();
  const [days, setDays] = useState(String(saved));
  const [pending, startTransition] = useTransition();
  const value = Number(days);
  const valid = Number.isInteger(value) && value >= 0 && value <= 3650;

  function save() {
    startTransition(async () => {
      let affected = 0;
      if (value > 0) {
        const preview = await previewRetention(value);
        if (!preview.ok) {
          report(preview);
          return;
        }
        affected = preview.count;
        if (affected > 0) {
          const ok = await confirm({
            title: `Delete ${formatNumber(affected)} conversation${affected === 1 ? "" : "s"} now?`,
            description: `Saving this deletes every unpinned chat not updated in ${value} days, now and every hour from here on.`,
            confirmLabel: "Save and delete",
            destructive: true,
          });
          if (!ok) return;
        }
      }
      const result = await saveConversationRetention(value);
      if (
        report(result, {
          title: "Retention saved",
          description: value === 0 ? "Chats are kept until their owner or an admin deletes them." : `${result.ok ? result.removed : 0} removed now.`,
        })
      ) {
        router.refresh();
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end"
      data-retention-form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Retention
        </p>
        <p className="text-sm text-muted-foreground">
          {saved === 0
            ? "Off: chats are kept until their owner or an admin deletes them."
            : `On: unpinned chats not updated in ${saved} days are deleted every hour.`}{" "}
          0 turns it off.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="retention-days" className="text-xs text-muted-foreground">
            Days
          </Label>
          <Input id="retention-days" type="number" min={0} max={3650} value={days} onChange={(event) => setDays(event.target.value)} className="h-9 w-24" />
        </div>
        <Button type="submit" disabled={pending || !valid || value === saved}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </div>
    </form>
  );
}
