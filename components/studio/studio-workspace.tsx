import Link from "next/link";
import type { ReactNode } from "react";
import { PageFrame } from "@/components/page-frame";
import type { EngineId, EngineStatus } from "@/lib/creative/types";

export function EngineBanner({
  engines,
  requires,
}: {
  engines: EngineStatus[];
  requires: EngineId[];
}) {
  if (!requires.length) return null;
  const missing = requires.filter((id) => !engines.find((engine) => engine.id === id)?.available);
  if (!missing.length) {
    return (
      <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm" data-engine-ok>
        Required engines are available: {requires.join(", ")}.
      </p>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm" data-engine-missing>
      <p className="font-medium">Generate is disabled until these engines are installed:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        {missing.map((id) => {
          const engine = engines.find((row) => row.id === id);
          return (
            <li key={id}>
              <span className="text-foreground">{engine?.label ?? id}</span>
              {engine?.setup ? ` — ${engine.setup}` : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2">
        <Link href="/studio/settings" className="underline underline-offset-4">
          Open Creative Settings
        </Link>
      </p>
    </div>
  );
}

export function StudioWorkspace({
  title,
  description,
  engines,
  requires = [],
  actions,
  children,
}: {
  title: string;
  description: string;
  engines: EngineStatus[];
  requires?: EngineId[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageFrame title={title} description={description} actions={actions}>
      <EngineBanner engines={engines} requires={requires} />
      {children}
    </PageFrame>
  );
}

export function StudioFormShell({
  children,
  canGenerate,
  onGenerateLabel = "Generate",
}: {
  children: ReactNode;
  canGenerate: boolean;
  onGenerateLabel?: string;
}) {
  return (
    <div className="max-w-xl space-y-4" data-studio-form>
      {children}
      <button
        type="button"
        disabled={!canGenerate}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        data-generate
        title={canGenerate ? onGenerateLabel : "Required engine is not installed"}
      >
        {onGenerateLabel}
      </button>
      {!canGenerate ? (
        <p className="text-xs text-muted-foreground">Generation stays off until the required engines report available.</p>
      ) : null}
    </div>
  );
}
