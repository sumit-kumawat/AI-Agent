import { EngineSettingsForm } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines, engineConfig } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";

export const metadata = { title: "Creative Settings" };

export default async function CreativeSettingsPage() {
  const page = studioModule("settings")!;
  const engines = await detectEngines();
  const config = engineConfig();
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {engines.map((engine) => (
          <div key={engine.id} className="rounded-xl border p-4 text-sm" data-engine={engine.id}>
            <p className="font-medium">{engine.label}</p>
            <p className="mt-1 text-muted-foreground">{engine.available ? "Available" : "Not available"}</p>
            <p className="mt-2 text-xs text-muted-foreground">{engine.detail}</p>
          </div>
        ))}
      </div>
      <EngineSettingsForm initial={config} />
    </StudioWorkspace>
  );
}
