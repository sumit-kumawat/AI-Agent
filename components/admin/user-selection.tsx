"use client";

import { Ban, Eraser, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { setUserSuspended } from "@/app/admin/actions";
import { CleanupDialog } from "@/components/admin/user-cleanup";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";

type Selection = { selected: Set<string>; toggle: (id: string, on: boolean) => void; setAll: (ids: string[], on: boolean) => void; clear: () => void };

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection outside UserSelection");
  return context;
}

/** Row selection for bulk actions on the users table; `selectable` excludes accounts the viewer cannot act on. */
export function UserSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value: Selection = {
    selected,
    toggle: (id, on) =>
      setSelected((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    setAll: (ids, on) =>
      setSelected((current) => {
        const next = new Set(current);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectUser({ id, label, disabled }: { id: string; label: string; disabled?: boolean }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      title={disabled ? "You cannot act on this account" : `Select ${label}`}
      disabled={disabled}
      checked={selected.has(id)}
      onChange={(event) => toggle(id, event.target.checked)}
      data-select-user={id}
      className="size-4 align-middle"
    />
  );
}

export function SelectAllUsers({ ids }: { ids: string[] }) {
  const { selected, setAll } = useSelection();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      title="Select all on this page"
      disabled={ids.length === 0}
      checked={all}
      onChange={(event) => setAll(ids, event.target.checked)}
      data-select-all
      className="size-4 align-middle"
    />
  );
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
