import { EnqueueButton } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";

export const metadata = { title: "Image Studio" };

export default async function ImageStudioPage() {
  const page = studioModule("image")!;
  const engines = await detectEngines();
  const ready = page.requires.every((id) => engines.find((engine) => engine.id === id)?.available);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines} requires={page.requires}>
      <div className="max-w-xl space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Prompt</span>
          <textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2" placeholder="Describe the image" disabled={!ready} readOnly />
        </label>
        <EnqueueButton kind="image.generate" label="Generate" disabled={!ready} payload={{ prompt: "" }} />
        <p className="text-xs text-muted-foreground">
          ComfyUI/Diffusers inference is deferred. Queueing is allowed only when ComfyUI reports available; the worker will still refuse generation until the GPU phase ships.
        </p>
      </div>
    </StudioWorkspace>
  );
}
