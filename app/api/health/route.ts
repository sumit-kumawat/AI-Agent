import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkOllama, getModelName } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database = true;
  try {
    db.get(sql`select 1`);
  } catch {
    database = false;
  }
  const ollama = await checkOllama();
  const ok = database && ollama.ok;

  return Response.json(
    {
      ok,
      database,
      ollama: ollama.ok,
      model: getModelName(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
