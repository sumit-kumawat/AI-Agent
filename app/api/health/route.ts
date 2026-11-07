import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getInventory, getModelName, resolveModel } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database = true;
  try {
    db.get(sql`select 1`);
  } catch {
    database = false;
  }
  const inventory = await getInventory();
  const models = inventory.ok ? inventory.models.map((model) => model.name) : [];
  const ok = database && inventory.ok && models.length > 0;

  return Response.json(
    {
      ok,
      database,
      ollama: inventory.ok,
      model: inventory.ok ? resolveModel(inventory.models) : getModelName(),
      models,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
