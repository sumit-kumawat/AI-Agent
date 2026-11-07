import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export const workspacesRoot = path.resolve(
  /*turbopackIgnore: true*/ env.WORKSPACES_ROOT ??
    path.join(env.DATA_DIR ?? path.join(process.cwd(), "data"), "workspaces"),
);

/** Deleted files and workspaces are moved here so they can be recovered. */
export const trashRoot = path.join(workspacesRoot, ".trash");

/** Never listed in search or quick open, and dimmed in the explorer. */
export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".cache",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".idea",
  ".gradle",
]);

const SENSITIVE_FILE = /^(\.env(\..+)?|id_rsa.*|id_ed25519.*|.*\.pem|.*\.key|\.npmrc|\.netrc)$/i;

/** Files whose contents should never be sent to an AI model or indexed. */
export function isSensitive(relative: string) {
  const name = path.basename(relative);
  return SENSITIVE_FILE.test(name) && name !== ".env.example";
}

export class PathError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The real path of a workspace's folder, created if missing. */
export function workspaceDir(folder: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(folder)) throw new PathError("Invalid workspace folder.");
  const dir = path.join(workspacesRoot, folder);
  fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync(dir);
}

/** Normalises a workspace-relative path to forward slashes with no leading slash. */
export function cleanRelative(input: string) {
  if (typeof input !== "string" || input.includes("\0")) throw new PathError("Invalid path.");
  const normalized = path.posix.normalize(input.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (normalized === "." || normalized === "") return "";
  if (normalized === ".." || normalized.startsWith("../")) throw new PathError("Paths must stay inside the workspace.");
  return normalized.replace(/\/+$/, "");
}

function inside(root: string, target: string) {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Resolves a workspace-relative path to an absolute one, refusing anything
 * that escapes the workspace, including through symlinks. For paths that do
 * not exist yet, the nearest existing parent is checked instead.
 */
export function resolveInside(root: string, relative: string) {
  const clean = cleanRelative(relative);
  const target = path.resolve(root, clean);
  if (!inside(root, target)) throw new PathError("Paths must stay inside the workspace.");
  let probe = target;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const real = fs.realpathSync(probe);
  if (!inside(root, real)) throw new PathError("That path points outside the workspace.", 403);
  return { absolute: target, relative: clean };
}

/** Writes into .git internals are refused so repositories cannot be corrupted from the editor. */
export function assertWritable(relative: string) {
  if (relative === ".git" || relative.startsWith(".git/")) {
    throw new PathError("Files inside .git cannot be changed from the editor.", 403);
  }
}
