"use client";

import { useShortcut } from "@/lib/shortcuts";

const SHORTCUTS: [string, string][] = [
  ["mod+k", "Search chats"],
  ["mod+shift+o", "New chat"],
  ["mod+shift+s", "Collapse or expand the sidebar"],
  ["mod+comma", "Open settings"],
  ["enter", "Send (configurable in Settings → General)"],
  ["shift+enter", "New line"],
  ["mod+c", "Copy"],
  ["mod+v", "Paste"],
  ["mod+z", "Undo"],
  ["mod+s", "Save the open file (IDE)"],
  ["mod+p", "Go to file (IDE)"],
  ["mod+shift+p", "All commands (IDE)"],
  ["escape", "Close a dialog or cancel an edit"],
];

function Row({ combo, action }: { combo: string; action: string }) {
  const label = useShortcut(combo);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{action}</dt>
      <dd>
        <kbd className="rounded-md border bg-muted px-2 py-0.5 font-sans text-xs" data-shortcut={combo}>
          {label}
        </kbd>
      </dd>
    </div>
  );
}

/** The app's shortcuts, written for the visitor's operating system. */
export function ShortcutTable() {
  return (
    <dl className="mt-3 divide-y rounded-2xl border">
      {SHORTCUTS.map(([combo, action]) => (
        <Row key={combo} combo={combo} action={action} />
      ))}
    </dl>
  );
}
