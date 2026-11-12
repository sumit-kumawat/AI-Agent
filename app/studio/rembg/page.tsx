import { EnqueueButton } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";

export const metadata = { title: "Background Removal" };

export default async function RembgPage() {
  const page = studioModule("rembg")!;
  const engines = await detectEngines();
  const ready = page.requires.every((id) => engines.find((engine) => engine.id === id)?.available);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines} requires={page.requires}>
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">Upload wiring lands with the rembg CPU pipeline. You can enqueue a job only when rembg is detected.</p>
        <EnqueueButton kind="rembg.run" label="Remove background" disabled={!ready} />
      </div>
    </StudioWorkspace>
  );
}
