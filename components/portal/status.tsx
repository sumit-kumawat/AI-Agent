const TONES = {
  good: "bg-primary/10 text-primary",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  bad: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  info: "bg-sky-500/10 text-sky-800 dark:text-sky-300",
} as const;

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: "good",
  active: "good",
  accepted: "good",
  completed: "good",
  unpaid: "warn",
  pending: "warn",
  proposal_sent: "warn",
  sent: "warn",
  overdue: "bad",
  suspended: "bad",
  failed: "bad",
  cancelled: "muted",
  declined: "muted",
  withdrawn: "muted",
  submitted: "info",
  under_review: "info",
  in_progress: "info",
  onboarding: "info",
  captured: "good",
  created: "muted",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      data-status={status}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize ${TONES[STATUS_TONE[status] ?? "muted"]}`}
    >
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}
