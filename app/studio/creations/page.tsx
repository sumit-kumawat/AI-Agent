import { DeleteAssetButton } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { listAssetsForUser } from "@/lib/creative/assets";
import { detectEngines } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";
import { requireUser } from "@/lib/session";

export const metadata = { title: "My Creations" };

export default async function CreationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const page = studioModule("creations")!;
  const user = await requireUser();
  const engines = await detectEngines();
  const params = await searchParams;
  const assets = listAssetsForUser(user.id!, { q: params.q, kind: params.kind });
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Filter by name or tag"
          className="h-9 min-w-56 flex-1 rounded-lg border bg-background px-3 text-sm"
        />
        <input
          name="kind"
          defaultValue={params.kind ?? ""}
          placeholder="Kind"
          className="h-9 w-36 rounded-lg border bg-background px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-lg border px-3 text-sm">
          Filter
        </button>
      </form>
      {assets.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No creations yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {assets.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{asset.name}</p>
                <p className="text-xs text-muted-foreground">
                  {asset.kind} · {(asset.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <DeleteAssetButton id={asset.id} />
            </li>
          ))}
        </ul>
      )}
    </StudioWorkspace>
  );
}
