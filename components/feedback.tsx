"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Tone = "success" | "error" | "warning" | "info";

type NotifyOptions = { tone?: Tone; title: string; description?: ReactNode };
type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get a red confirm button and a warning icon. */
  destructive?: boolean;
};
type PromptOptions = ConfirmOptions & { label?: string; placeholder?: string; defaultValue?: string; maxLength?: number };

type Entry =
  | { id: number; key: string; kind: "notify"; options: NotifyOptions; resolve: () => void }
  | { id: number; key: string; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; key: string; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type Feedback = {
  notify: (options: NotifyOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** Shows an error popup for a failed action result; returns whether it succeeded. */
  report: (result: { ok: boolean; error?: string }, success?: NotifyOptions) => boolean;
};

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside <FeedbackProvider>.");
  return value;
}

const ICONS: Record<Tone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "bg-primary/10 text-primary" },
  error: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, className: "bg-amber-100 text-amber-700" },
  info: { icon: Info, className: "bg-muted text-foreground" },
};

function keyFor(kind: string, title: string, description: ReactNode) {
  return `${kind}|${title}|${typeof description === "string" ? description : ""}`;
}

function createFeedback(setQueue: Dispatch<SetStateAction<Entry[]>>, pending: Set<string>): Feedback {
  let nextId = 1;
  const push = (entry: Omit<Entry, "id">) => {
    // The same message already waiting or on screen is not shown twice.
    if (pending.has(entry.key)) {
      if (entry.kind === "confirm") (entry.resolve as (value: boolean) => void)(false);
      else if (entry.kind === "prompt") (entry.resolve as (value: string | null) => void)(null);
      else (entry.resolve as () => void)();
      return;
    }
    pending.add(entry.key);
    setQueue((current) => [...current, { ...entry, id: nextId++ } as Entry]);
  };
  const notify = (options: NotifyOptions) =>
    new Promise<void>((resolve) =>
      push({ kind: "notify", key: keyFor("notify", options.title, options.description), options, resolve }),
    );
  return {
    notify,
    confirm: (options) =>
      new Promise<boolean>((resolve) =>
        push({ kind: "confirm", key: keyFor("confirm", options.title, options.description), options, resolve }),
      ),
    prompt: (options) =>
      new Promise<string | null>((resolve) =>
        push({ kind: "prompt", key: keyFor("prompt", options.title, options.description), options, resolve }),
      ),
    report: (result, success) => {
      if (!result.ok) {
        void notify({ tone: "error", title: "That did not work", description: result.error ?? "Something went wrong. Try again." });
        return false;
      }
      if (success) void notify({ tone: "success", ...success });
      return true;
    },
  };
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Entry[]>([]);
  const [pending] = useState(() => new Set<string>());
  const [value] = useState(() => createFeedback(setQueue, pending));

  const current = queue[0];

  function close(entry: Entry, result: boolean | string | null) {
    pending.delete(entry.key);
    setQueue((items) => items.filter((item) => item.id !== entry.id));
    if (entry.kind === "confirm") entry.resolve(result === true);
    else if (entry.kind === "prompt") entry.resolve(typeof result === "string" ? result : null);
    else entry.resolve();
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {current ? <FeedbackDialog key={current.id} entry={current} onClose={(result) => close(current, result)} /> : null}
    </FeedbackContext.Provider>
  );
}

function FeedbackDialog({ entry, onClose }: { entry: Entry; onClose: (result: boolean | string | null) => void }) {
  const [text, setText] = useState(entry.kind === "prompt" ? (entry.options.defaultValue ?? "") : "");
  const tone: Tone =
    entry.kind === "notify" ? (entry.options.tone ?? "info") : entry.options.destructive ? "warning" : "info";
  const { icon: Icon, className } = ICONS[tone];
  const destructive = entry.kind !== "notify" && entry.options.destructive;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose(entry.kind === "notify" ? true : null);
      }}
    >
      <AlertDialogContent className="rounded-2xl p-5 sm:max-w-md data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onClose(entry.kind === "prompt" ? text.trim() : true);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogMedia className={`rounded-full ${className}`}>
              <Icon />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-sans text-base font-semibold">{entry.options.title}</AlertDialogTitle>
            {entry.options.description ? (
              <AlertDialogDescription>{entry.options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          {entry.kind === "prompt" ? (
            <label className="grid gap-1.5 text-sm">
              {entry.options.label ? <span className="font-medium">{entry.options.label}</span> : null}
              <Input
                autoFocus
                value={text}
                maxLength={entry.options.maxLength ?? 500}
                placeholder={entry.options.placeholder}
                onChange={(event) => setText(event.target.value)}
                className="h-10"
              />
            </label>
          ) : null}
          <AlertDialogFooter className="-mx-5 -mb-5 rounded-b-2xl px-5">
            {entry.kind === "notify" ? (
              <Button type="submit" autoFocus>
                OK
              </Button>
            ) : (
              <>
                <AlertDialogCancel type="button">{entry.options.cancelLabel ?? "Cancel"}</AlertDialogCancel>
                <Button type="submit" variant={destructive ? "destructive" : "default"} autoFocus={entry.kind === "confirm"}>
                  {entry.options.confirmLabel ?? "Continue"}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
