import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { PathError, trashRoot, workspaceDir, workspacesRoot } from "@/lib/ide/paths";

const run = promisify(execFile);

export type Workspace = typeof workspaces.$inferSelect;

export function listWorkspaces() {
  return db.select().from(workspaces).orderBy(desc(workspaces.openedAt), desc(workspaces.createdAt)).all();
}

export function getWorkspace(id: string) {
  return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
}

export function touchWorkspace(id: string) {
  db.update(workspaces).set({ openedAt: Date.now() }).where(eq(workspaces.id, id)).run();
}

/** The workspace row and its real folder, or a 404. */
export function openWorkspace(id: string) {
  const workspace = getWorkspace(id);
  if (!workspace) throw new PathError("Workspace not found.", 404);
  return { workspace, root: workspaceDir(workspace.folder) };
}

function folderFor(name: string, id: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "workspace"}-${id.slice(0, 8)}`;
}

const GIT_URL = /^https:\/\/[a-z0-9.-]+(:\d+)?\/[\w.~/-]+$/i;

export async function createWorkspace(input: { name: string; gitUrl?: string; userId: string }) {
  const id = crypto.randomUUID();
  const folder = folderFor(input.name, id);
  const dir = path.join(workspacesRoot, folder);
  fs.mkdirSync(workspacesRoot, { recursive: true });
  if (input.gitUrl) {
    if (!GIT_URL.test(input.gitUrl)) throw new PathError("Use an https:// Git URL, for example https://github.com/owner/repo.git.");
    try {
      await run("git", ["clone", "--", input.gitUrl, dir], {
        timeout: 5 * 60 * 1000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      const message = (error as { stderr?: string }).stderr?.trim().split("\n").at(-1);
      throw new PathError(`Could not clone that repository${message ? `: ${message}` : "."}`, 422);
    }
  } else {
    fs.mkdirSync(dir);
  }
  const now = Date.now();
  db.insert(workspaces)
    .values({ id, name: input.name, folder, createdBy: input.userId, createdAt: now, openedAt: now })
    .run();
  return getWorkspace(id)!;
}

/** Removes the workspace and moves its folder to the trash so it can be recovered. */
export function deleteWorkspace(id: string) {
  const workspace = getWorkspace(id);
  if (!workspace) throw new PathError("Workspace not found.", 404);
  const dir = path.join(workspacesRoot, workspace.folder);
  if (fs.existsSync(dir)) {
    const destination = path.join(trashRoot, "workspaces", `${Date.now()}-${workspace.folder}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(dir, destination);
  }
  db.delete(workspaces).where(eq(workspaces.id, id)).run();
  return workspace;
}
