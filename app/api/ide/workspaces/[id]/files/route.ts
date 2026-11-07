import { audit } from "@/lib/audit";
import { createEntry, listAllFiles, listDir, readFile, renameEntry, trashEntry, writeFile } from "@/lib/ide/files";
import { HttpError, errorResponse, ideAdmin, readJson } from "@/lib/ide/guard";
import { openWorkspace } from "@/lib/ide/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "no-store" } };

/** ?dir=path lists a folder, ?file=path reads a file, ?all=1 lists every file for quick open. */
export async function GET(request: Request, { params }: Params) {
  try {
    await ideAdmin(request);
    const { root } = openWorkspace((await params).id);
    const url = new URL(request.url);
    if (url.searchParams.has("file")) return Response.json(readFile(root, url.searchParams.get("file")!), noStore);
    if (url.searchParams.has("all")) return Response.json({ files: listAllFiles(root) }, noStore);
    return Response.json({ entries: listDir(root, url.searchParams.get("dir") ?? "") }, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Saves a file. Send `mtime` from when it was opened to detect outside changes. */
export async function PUT(request: Request, { params }: Params) {
  try {
    await ideAdmin(request);
    const { root } = openWorkspace((await params).id);
    const body = await readJson<{ path?: unknown; content?: unknown; mtime?: unknown }>(request);
    if (typeof body.path !== "string" || typeof body.content !== "string") throw new HttpError("Send path and content.", 400);
    const mtime = typeof body.mtime === "number" ? body.mtime : null;
    return Response.json(writeFile(root, body.path, body.content, mtime));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates an empty file or folder; never overwrites. */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const { workspace, root } = openWorkspace((await params).id);
    const body = await readJson<{ path?: unknown; kind?: unknown }>(request);
    if (typeof body.path !== "string" || (body.kind !== "file" && body.kind !== "dir")) {
      throw new HttpError("Send a path and kind (file or dir).", 400);
    }
    const created = createEntry(root, body.path, body.kind);
    audit(admin, `file.create`, { type: "workspace", id: workspace.id }, { path: created.path, kind: body.kind });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const { workspace, root } = openWorkspace((await params).id);
    const body = await readJson<{ from?: unknown; to?: unknown }>(request);
    if (typeof body.from !== "string" || typeof body.to !== "string") throw new HttpError("Send from and to.", 400);
    const renamed = renameEntry(root, body.from, body.to);
    audit(admin, "file.rename", { type: "workspace", id: workspace.id }, { from: body.from, to: renamed.path });
    return Response.json(renamed);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Moves a file or folder to the trash (recoverable from the server's workspace trash). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const { workspace, root } = openWorkspace((await params).id);
    const target = new URL(request.url).searchParams.get("path");
    if (!target) throw new HttpError("Send a path.", 400);
    const removed = trashEntry(root, workspace.folder, target);
    audit(admin, "file.delete", { type: "workspace", id: workspace.id }, { path: removed.path });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
