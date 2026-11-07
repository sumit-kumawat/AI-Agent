import { z } from "zod";
import { audit } from "@/lib/audit";
import { HttpError, errorResponse, ideAdmin, readJson } from "@/lib/ide/guard";
import { createWorkspace, listWorkspaces } from "@/lib/ide/workspaces";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the workspace.").max(80),
  gitUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
});

export async function GET(request: Request) {
  try {
    await ideAdmin(request);
    return Response.json({ workspaces: listWorkspaces() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await ideAdmin(request);
    const limited = rateLimit(`ide:workspace:${admin.id}`, 20, 60 * 60 * 1000, { endpoint: "ide.workspace", userId: admin.id });
    if (!limited.ok) return tooManyRequests(limited.retryAfter);
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(parsed.error.issues[0]?.message ?? "Check the form.", 400);
    const workspace = await createWorkspace({ ...parsed.data, userId: admin.id });
    audit(admin, "workspace.create", { type: "workspace", id: workspace.id }, { name: workspace.name, gitUrl: parsed.data.gitUrl ?? null });
    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
