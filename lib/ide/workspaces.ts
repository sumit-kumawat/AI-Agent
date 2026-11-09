import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { PathError, trashRoot, workspaceDir, workspacesRoot } from "@/lib/ide/paths";

const run = promisify(execFile);

export type Workspace = typeof workspaces.$inferSelect;

type Owner = { id: string; admin: unknown };

/** A user's own workspaces; admins also see ones whose owner was deleted. */
export function listWorkspaces(owner: Owner) {
  const mine = owner.admin
    ? or(eq(workspaces.createdBy, owner.id), isNull(workspaces.createdBy))
    : eq(workspaces.createdBy, owner.id);
  return db.select().from(workspaces).where(mine).orderBy(desc(workspaces.openedAt), desc(workspaces.createdAt)).all();
}

export function getWorkspace(id: string) {
  return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
}

/** The workspace if this user owns it (admins: any). Others get the same 404 as a missing one. */
export function workspaceFor(owner: Owner, id: string) {
  const workspace = getWorkspace(id);
  if (!workspace || (!owner.admin && workspace.createdBy !== owner.id)) return null;
  return workspace;
}

export function touchWorkspace(id: string) {
  db.update(workspaces).set({ openedAt: Date.now() }).where(eq(workspaces.id, id)).run();
}

/** The workspace row and its real folder, or a 404 when missing or not this user's. */
export function openWorkspace(owner: Owner, id: string) {
  const workspace = workspaceFor(owner, id);
  if (!workspace) throw new PathError("Workspace not found.", 404);
  return { workspace, root: workspaceDir(workspace.folder) };
}

/** Bytes on disk under `dir`, not following symlinks. */
export function folderBytes(dir: string) {
  let total = 0;
  let visited = 0;
  const stack = [dir];
  while (stack.length && visited < 500_000) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) total += fs.lstatSync(absolute, { throwIfNoEntry: false })?.size ?? 0;
    }
  }
  return total;
}

/** Bytes used by every workspace this user owns. */
export function ideStorageUsed(userId: string) {
  const owned = db.select({ folder: workspaces.folder }).from(workspaces).where(eq(workspaces.createdBy, userId)).all();
  return owned.reduce((sum, { folder }) => sum + folderBytes(path.join(workspacesRoot, folder)), 0);
}

function formatMb(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

/** Throws a 413 when adding `bytes` would take this user past their plan's IDE storage. */
export function assertIdeRoom(actor: { id: string; storageLimit: number | null }, bytes: number) {
  if (actor.storageLimit === null || bytes <= 0) return;
  const used = ideStorageUsed(actor.id);
  if (used + bytes > actor.storageLimit) {
    throw new PathError(
      `This would use more than your plan's ${formatMb(actor.storageLimit)} of IDE storage (${formatMb(used)} used). Delete files or upgrade your plan.`,
      413,
    );
  }
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

export async function createWorkspace(input: { name: string; gitUrl?: string; owner: { id: string; storageLimit: number | null } }) {
  const id = crypto.randomUUID();
  const folder = folderFor(input.name, id);
  const dir = path.join(workspacesRoot, folder);
  fs.mkdirSync(workspacesRoot, { recursive: true });
  const { storageLimit } = input.owner;
  if (input.gitUrl) {
    if (!GIT_URL.test(input.gitUrl)) throw new PathError("Use an https:// Git URL, for example https://github.com/owner/repo.git.");
    const used = storageLimit === null ? 0 : ideStorageUsed(input.owner.id);
    if (storageLimit !== null && used >= storageLimit) assertIdeRoom(input.owner, 1);
    try {
      // Plans with a storage cap get a shallow clone: the history is often most of a repository's size.
      await run("git", ["clone", ...(storageLimit === null ? [] : ["--depth", "1"]), "--", input.gitUrl, dir], {
        timeout: 5 * 60 * 1000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      const message = (error as { stderr?: string }).stderr?.trim().split("\n").at(-1);
      throw new PathError(`Could not clone that repository${message ? `: ${message}` : "."}`, 422);
    }
    if (storageLimit !== null && used + folderBytes(dir) > storageLimit) {
      const size = folderBytes(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      throw new PathError(
        `That repository needs ${formatMb(size)}, more than the ${formatMb(Math.max(0, storageLimit - used))} of IDE storage left on your plan.`,
        413,
      );
    }
  } else {
    fs.mkdirSync(dir);
  }
  const now = Date.now();
  db.insert(workspaces)
    .values({ id, name: input.name, folder, createdBy: input.owner.id, createdAt: now, openedAt: now })
    .run();
  return getWorkspace(id)!;
}

/** Erases every workspace a user owns, folders included; for deleting an account. Returns how many. */
export function removeUserWorkspaces(userId: string) {
  const owned = db.select().from(workspaces).where(eq(workspaces.createdBy, userId)).all();
  for (const workspace of owned) {
    fs.rmSync(path.join(workspacesRoot, workspace.folder), { recursive: true, force: true });
    db.delete(workspaces).where(eq(workspaces.id, workspace.id)).run();
  }
  return owned.length;
}

/**
 * Removes the workspace. Admins' folders go to the trash so they can be
 * recovered; customers' are erased, since the trash would not count toward
 * their storage.
 */
export function deleteWorkspace(owner: Owner, id: string) {
  const workspace = workspaceFor(owner, id);
  if (!workspace) throw new PathError("Workspace not found.", 404);
  const dir = path.join(workspacesRoot, workspace.folder);
  if (!owner.admin) {
    fs.rmSync(dir, { recursive: true, force: true });
  } else if (fs.existsSync(dir)) {
    const destination = path.join(trashRoot, "workspaces", `${Date.now()}-${workspace.folder}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(dir, destination);
  }
  db.delete(workspaces).where(eq(workspaces.id, id)).run();
  return workspace;
}
