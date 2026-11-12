import { EnqueueButton } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";

export const metadata = { title: "Media Tools" };

export default async function MediaToolsPage() {
  const page = studioModule("media")!;
  const engines = await detectEngines();
  const ready = page.requires.every((id) => engines.find((engine) => engine.id === id)?.available);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines} requires={page.requires}>
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">Convert and trim once FFmpeg is on PATH. Phase 1 queues the job; the conversion pipeline is stubbed.</p>
        <EnqueueButton kind="media.convert" label="Queue convert" disabled={!ready} payload={{ op: "probe" }} />
      </div>
    </StudioWorkspace>
  );
}
