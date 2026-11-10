"use client";

import { Ban, Eraser, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setUserSuspended } from "@/app/admin/actions";
import { SelectAll, SelectionProvider, SelectRow, useSelection } from "@/components/admin/selection";
import { CleanupDialog } from "@/components/admin/user-cleanup";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";

export const UserSelection = SelectionProvider;
export const SelectAllUsers = SelectAll;

export function SelectUser({ id, label, disabled }: { id: string; label: string; disabled?: boolean }) {
  return <SelectRow id={id} label={label} kind="user" disabled={disabled} disabledReason="You cannot act on this account" />;
}

export function BulkUserActions() {
  const { selected, clear } = useSelection();
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [dialog, setDialog] = useState<"delete" | "cleanup" | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = [...selected];
  if (ids.length === 0) return null;

  function suspend(suspended: boolean) {
    startTransition(async () => {
      const ok = await confirm({
        title: `${suspended ? "Suspend" : "Reactivate"} ${ids.length} account${ids.length === 1 ? "" : "s"}?`,
        description: suspended ? "They are signed out and cannot sign in until reactivated." : "They can sign in again.",
        confirmLabel: suspended ? "Suspend" : "Reactivate",
        destructive: suspended,
      });
      if (!ok) return;
      const failures: string[] = [];
      for (const id of ids) {
        const result = await setUserSuspended(id, suspended);
        if (!result.ok) failures.push(result.error);
      }
      void notify({
        tone: failures.length ? "error" : "success",
        title: `${ids.length - failures.length} of ${ids.length} ${suspended ? "suspended" : "reactivated"}`,
        description: failures.length ? [...new Set(failures)].join(" ") : undefined,
      });
      clear();
      router.refresh();
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm" data-bulk-actions>
      <span className="font-medium">{ids.length} selected</span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => suspend(true)}>
        <Ban /> Suspend
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => suspend(false)}>
        <RotateCcw /> Reactivate
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("cleanup")} data-bulk="cleanup">
        <Eraser /> Remove data…
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => setDialog("delete")} data-bulk="delete">
        <Trash2 /> Delete…
      </Button>
      <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={clear} aria-label="Clear selection" title="Clear selection">
        <X />
      </Button>
      <CleanupDialog ids={ids} mode={dialog ?? "delete"} open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)} onDone={clear} />
    </div>
  );
}
