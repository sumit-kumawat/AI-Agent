"use client";

import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cleanupUsers, previewUserCleanup } from "@/app/admin/actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes, formatNumber } from "@/lib/format";
import type { CleanupPart, UserDataSummary } from "@/lib/admin/user-data";

type Preview = (UserDataSummary & { missing: false; refusal: string | null }) | { id: string; missing: true };

const PART_LABEL: Record<Exclude<CleanupPart, "account">, string> = {
  conversations: "Conversations and messages",
  attachments: "Uploaded files",
  workspaces: "IDE workspaces and their files",
  memories: "Saved memories",
};

/** Delete accounts, or only selected parts of their data, after showing exactly what is affected. */
export function CleanupDialog({
  ids,
  mode,
  open,
  onOpenChange,
  onDone,
}: {
  ids: string[];
  /** "delete" removes accounts; "cleanup" removes chosen data and keeps the accounts. */
  mode: "delete" | "cleanup";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { report } = useFeedback();
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<Set<CleanupPart>>(new Set(["conversations", "attachments"]));
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const key = ids.join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    started.current = false;
    void previewUserCleanup(key.split(",")).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.users);
        setError(null);
      } else setError(result.error);
    });
    return () => {
      cancelled = true;
      setPreview(null);
      setTyped("");
    };
  }, [open, key]);

  const expected = mode === "delete" ? "DELETE" : "CLEAN UP";
  const allowed = (preview ?? []).filter((row): row is Extract<Preview, { missing: false }> => !row.missing && !row.refusal);
  const refused = (preview ?? []).filter((row) => row.missing || row.refusal);
  const sum = (pick: (row: UserDataSummary) => number) => allowed.reduce((total, row) => total + pick(row), 0);
  const chosen: CleanupPart[] = mode === "delete" ? ["account"] : [...parts];

  async function execute() {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    const result = await cleanupUsers({ ids: allowed.map((row) => row.id), parts: chosen, confirmation: typed });
    setRunning(false);
    if (result.ok) {
      const skipped = result.skipped.length ? ` ${result.skipped.length} skipped: ${result.skipped.map((row) => row.reason).join(" ")}` : "";
      report(result, {
        title: mode === "delete" ? `${result.done.length} account${result.done.length === 1 ? "" : "s"} deleted` : `Data removed for ${result.done.length} account${result.done.length === 1 ? "" : "s"}`,
        description: `Usage and audit records were kept.${skipped}`,
      });
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } else {
      started.current = false;
      report(result);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl" data-cleanup-dialog={mode}>
        <DialogHeader>
          <DialogTitle>
            {mode === "delete" ? `Delete ${ids.length === 1 ? "this account" : `${ids.length} accounts`}?` : "Remove selected data"}
          </DialogTitle>
          <DialogDescription>
            {mode === "delete"
              ? "The accounts and everything they own are removed permanently. This cannot be undone."
              : "Choose what to remove. The accounts stay and can keep signing in."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : preview === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Counting what is affected…
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            {mode === "cleanup" ? (
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Data to remove</legend>
                {(Object.keys(PART_LABEL) as (keyof typeof PART_LABEL)[]).map((part) => (
                  <label key={part} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-cleanup-part={part}
                      checked={parts.has(part)}
                      onChange={(event) =>
                        setParts((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(part);
                          else next.delete(part);
                          return next;
                        })
                      }
                    />
                    {PART_LABEL[part]}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <div className="rounded-lg border" data-cleanup-preview>
              <p className="border-b px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Will be removed from {allowed.length} account{allowed.length === 1 ? "" : "s"}
              </p>
              <ul className="divide-y">
                {(mode === "delete" || parts.has("conversations")) && (
                  <li className="flex justify-between px-3 py-1.5">
                    <span>Conversations</span>
                    <span data-affected="conversations">
                      {formatNumber(sum((row) => row.conversations))} ({formatNumber(sum((row) => row.messages))} messages)
                    </span>
                  </li>
                )}
                {(mode === "delete" || parts.has("attachments") || parts.has("conversations")) && (
                  <li className="flex justify-between px-3 py-1.5">
                    <span>Uploaded files{mode === "cleanup" && !parts.has("attachments") ? " in those chats" : ""}</span>
                    <span data-affected="attachments">
                      {mode === "cleanup" && !parts.has("attachments") ? "up to " : ""}
                      {formatNumber(sum((row) => row.attachments))} ({formatBytes(sum((row) => row.attachmentBytes))})
                    </span>
                  </li>
                )}
                {(mode === "delete" || parts.has("workspaces")) && (
                  <li className="flex justify-between px-3 py-1.5">
                    <span>IDE workspaces</span>
                    <span data-affected="workspaces">
                      {formatNumber(sum((row) => row.workspaces))} ({formatBytes(sum((row) => row.workspaceBytes))})
                    </span>
                  </li>
                )}
                {(mode === "delete" || parts.has("memories")) && (
                  <li className="flex justify-between px-3 py-1.5">
                    <span>Saved memories</span>
                    <span data-affected="memories">{formatNumber(sum((row) => row.memories))}</span>
                  </li>
                )}
              </ul>
            </div>

            <p className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-cleanup-kept>
              <ShieldCheck className="size-4 shrink-0" />
              Kept: {formatNumber(sum((row) => row.usageEvents))} usage records (token accounting) and{" "}
              {formatNumber(sum((row) => row.auditEntries))} audit log entries. This action is added to the audit log.
            </p>

            {refused.length ? (
              <ul className="space-y-1 text-xs text-destructive" data-cleanup-refused>
                {refused.map((row) => (
                  <li key={row.id}>{row.missing ? "One account no longer exists." : `${row.email}: ${row.refusal}`}</li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="cleanup-confirm">
                Type <span className="font-mono font-semibold">{expected}</span> to confirm
              </Label>
              <Input id="cleanup-confirm" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="h-9" />
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
            disabled={running || !preview || allowed.length === 0 || chosen.length === 0 || typed.trim() !== expected}
            data-cleanup-confirm
          >
            {running ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {mode === "delete" ? "Delete permanently" : "Remove data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
