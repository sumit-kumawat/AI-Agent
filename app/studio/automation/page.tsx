import { CreateScheduleForm } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { listSchedulesForUser } from "@/lib/creative/schedules";
import { studioModule } from "@/lib/creative/types";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Automation & Scheduler" };

export default async function AutomationPage() {
  const page = studioModule("automation")!;
  const user = await requireUser();
  const engines = await detectEngines();
  const schedules = listSchedulesForUser(user.id!);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      <p className="mb-4 text-sm text-muted-foreground">
        Schedules are stored now. The daemon that runs them without a browser is deferred.
      </p>
      <CreateScheduleForm />
      {schedules.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No schedules yet.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{schedule.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{schedule.cron}</p>
              </div>
              <span className="text-muted-foreground">{schedule.enabled ? "Enabled" : "Paused"}</span>
            </li>
          ))}
        </ul>
      )}
    </StudioWorkspace>
  );
}
