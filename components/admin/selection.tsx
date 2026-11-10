"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Selection = { selected: Set<string>; toggle: (id: string, on: boolean) => void; setAll: (ids: string[], on: boolean) => void; clear: () => void };

const SelectionContext = createContext<Selection | null>(null);

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection outside SelectionProvider");
  return context;
}

/** Row selection for bulk actions on an admin table. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const update = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const value: Selection = {
    selected,
    toggle: (id, on) => update([id], on),
    setAll: update,
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** `kind` names the data attribute (`data-select-<kind>`) tests and styles hook on to. */
export function SelectRow({ id, label, kind, disabled, disabledReason }: { id: string; label: string; kind: string; disabled?: boolean; disabledReason?: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      title={disabled ? disabledReason : `Select ${label}`}
      disabled={disabled}
      checked={selected.has(id)}
      onChange={(event) => toggle(id, event.target.checked)}
      {...{ [`data-select-${kind}`]: id }}
      className="size-4 align-middle accent-primary"
    />
  );
}

export function SelectAll({ ids }: { ids: string[] }) {
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
      className="size-4 align-middle accent-primary"
    />
  );
}
