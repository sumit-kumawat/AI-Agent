import { QueueActions } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { listJobsForUser } from "@/lib/creative/queue";
import { studioModule } from "@/lib/creative/types";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Processing Queue" };

export default async function QueuePage() {
  const page = studioModule("queue")!;
  const user = await requireUser();
  const engines = await detectEngines();
  const jobs = listJobsForUser(user.id!);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      {jobs.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No jobs in the queue.</p>
      ) : (
        <ul className="divide-y rounded-xl border" data-job-queue>
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{job.kind}</p>
                <p className="text-xs text-muted-foreground">
                  {job.status}
                  {typeof job.progress === "number" ? ` · ${Math.round(job.progress * 100)}%` : ""}
                  {job.error ? ` · ${job.error}` : ""}
                </p>
              </div>
              <QueueActions jobId={job.id} status={job.status} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Run <code className="rounded bg-muted px-1">node scripts/creative-worker.mjs</code> to process queued CPU jobs.
      </p>
    </StudioWorkspace>
  );
}
