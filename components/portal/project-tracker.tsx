import { PROJECT_FLOW, projectLabel } from "@/lib/projects";

export function ProjectTracker({ status }: { status: string }) {
  const position = PROJECT_FLOW.indexOf(status as (typeof PROJECT_FLOW)[number]);
  if (position === -1) return null;
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progress">
      {PROJECT_FLOW.map((step, index) => {
        const state = index < position || (step === "completed" && index === position) ? "done" : index === position ? "current" : "todo";
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={`rounded-full px-3 py-1 text-xs ${
              state === "done"
                ? "bg-primary/10 text-primary"
                : state === "current"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {projectLabel(step)}
          </li>
        );
      })}
    </ol>
  );
}
