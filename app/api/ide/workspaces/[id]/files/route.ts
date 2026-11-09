import fs from "node:fs";
import { audit } from "@/lib/audit";
import { createEntry, listAllFiles, listDir, readFile, renameEntry, trashEntry, writeFile } from "@/lib/ide/files";
import { HttpError, errorResponse, ideUser, readJson, type IdeActor } from "@/lib/ide/guard";
import { resolveInside } from "@/lib/ide/paths";
import { assertIdeRoom, openWorkspace } from "@/lib/ide/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "no-store" } };

/** File changes in the admin audit log; customers' own files are their business. */
function record(actor: IdeActor, action: string, workspaceId: string, details: Record<string, unknown>) {
  if (actor.admin) audit(actor.admin, action, { type: "workspace", id: workspaceId }, details);
}

/** ?dir=path lists a folder, ?file=path reads a file, ?all=1 lists every file for quick open. */
export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await ideUser(request);
    const { root } = openWorkspace(actor, (await params).id);
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
    const actor = await ideUser(request);
    const { root } = openWorkspace(actor, (await params).id);
    const body = await readJson<{ path?: unknown; content?: unknown; mtime?: unknown }>(request);
    if (typeof body.path !== "string" || typeof body.content !== "string") throw new HttpError("Send path and content.", 400);
    const { absolute } = resolveInside(root, body.path);
    const previous = fs.statSync(absolute, { throwIfNoEntry: false });
    assertIdeRoom(actor, Buffer.byteLength(body.content) - (previous?.isFile() ? previous.size : 0));
    const mtime = typeof body.mtime === "number" ? body.mtime : null;
    return Response.json(writeFile(root, body.path, body.content, mtime));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates an empty file or folder; never overwrites. */
export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await ideUser(request);
    const { workspace, root } = openWorkspace(actor, (await params).id);
    const body = await readJson<{ path?: unknown; kind?: unknown }>(request);
    if (typeof body.path !== "string" || (body.kind !== "file" && body.kind !== "dir")) {
      throw new HttpError("Send a path and kind (file or dir).", 400);
    }
    assertIdeRoom(actor, 1);
    const created = createEntry(root, body.path, body.kind);
    record(actor, "file.create", workspace.id, { path: created.path, kind: body.kind });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await ideUser(request);
    const { workspace, root } = openWorkspace(actor, (await params).id);
    const body = await readJson<{ from?: unknown; to?: unknown }>(request);
    if (typeof body.from !== "string" || typeof body.to !== "string") throw new HttpError("Send from and to.", 400);
    const renamed = renameEntry(root, body.from, body.to);
    record(actor, "file.rename", workspace.id, { from: body.from, to: renamed.path });
    return Response.json(renamed);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Deletes a file or folder: to the trash for admins, permanently for customers. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const actor = await ideUser(request);
    const { workspace, root } = openWorkspace(actor, (await params).id);
    const target = new URL(request.url).searchParams.get("path");
    if (!target) throw new HttpError("Send a path.", 400);
    const removed = trashEntry(root, workspace.folder, target, !actor.admin);
    record(actor, "file.delete", workspace.id, { path: removed.path });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
