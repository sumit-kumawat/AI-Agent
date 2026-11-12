import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { detectEngines } from "@/lib/creative/engines";
import { listCreativeModels } from "@/lib/creative/models";
import { studioModule } from "@/lib/creative/types";

export const metadata = { title: "Model Library" };

export default async function ModelLibraryPage() {
  const page = studioModule("models")!;
  const engines = await detectEngines();
  const models = listCreativeModels();
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">Model</th>
              <th className="px-4 py-2 font-normal">Licence</th>
              <th className="px-4 py-2 font-normal">Size</th>
              <th className="px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.family} · {model.kind}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{model.notes}</p>
                </td>
                <td className="px-4 py-3">{model.licence}</td>
                <td className="px-4 py-3">{model.sizeHint}</td>
                <td className="px-4 py-3">{model.installed ? "Installed" : "Not downloaded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StudioWorkspace>
  );
}
