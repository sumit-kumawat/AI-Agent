import fs from "node:fs";
import path from "node:path";
import {
  IGNORED_DIRS,
  PathError,
  assertWritable,
  cleanRelative,
  isSensitive,
  resolveInside,
  trashRoot,
} from "@/lib/ide/paths";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type DirEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  ignored: boolean;
  size?: number;
};

export function listDir(root: string, relative: string): DirEntry[] {
  const { absolute, relative: clean } = resolveInside(root, relative);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new PathError("Folder not found.", 404);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .map((entry): DirEntry | null => {
      const childPath = clean ? `${clean}/${entry.name}` : entry.name;
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          resolveInside(root, childPath);
          isDir = fs.statSync(path.join(absolute, entry.name)).isDirectory();
        } catch {
          return null;
        }
      } else if (!isDir && !entry.isFile()) {
        return null;
      }
      return {
        name: entry.name,
        path: childPath,
        kind: isDir ? "dir" : "file",
        ignored: isDir && IGNORED_DIRS.has(entry.name),
      };
    })
    .filter((entry): entry is DirEntry => entry !== null)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
}

function looksBinary(buffer: Buffer) {
  const sample = buffer.subarray(0, 8000);
  return sample.includes(0);
}

export type FileContent =
  | { path: string; binary: false; content: string; mtime: number; size: number }
  | { path: string; binary: true; mtime: number; size: number };

export function readFile(root: string, relative: string): FileContent {
  const { absolute, relative: clean } = resolveInside(root, relative);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new PathError("File not found.", 404);
  if (stat.size > MAX_FILE_BYTES) throw new PathError("That file is larger than 5 MB and cannot be opened.", 413);
  const buffer = fs.readFileSync(absolute);
  if (looksBinary(buffer)) return { path: clean, binary: true, mtime: stat.mtimeMs, size: stat.size };
  return { path: clean, binary: false, content: buffer.toString("utf8"), mtime: stat.mtimeMs, size: stat.size };
}

/**
 * Saves a file atomically. When `expectedMtime` is given and the file changed
 * on disk since it was opened, nothing is written and a conflict is reported.
 */
export function writeFile(root: string, relative: string, content: string, expectedMtime?: number | null) {
  const { absolute, relative: clean } = resolveInside(root, relative);
  assertWritable(clean);
  if (!clean) throw new PathError("Choose a file name.");
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new PathError("Files larger than 5 MB cannot be saved.", 413);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (stat?.isDirectory()) throw new PathError("A folder with that name already exists.", 409);
  if (stat && expectedMtime != null && Math.abs(stat.mtimeMs - expectedMtime) > 1) {
    throw new PathError("The file changed on disk since you opened it.", 409);
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.conzex-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(temp, content, { mode: stat?.mode ?? 0o644 });
  fs.renameSync(temp, absolute);
  return { path: clean, mtime: fs.statSync(absolute).mtimeMs };
}

export function createEntry(root: string, relative: string, kind: "file" | "dir") {
  const { absolute, relative: clean } = resolveInside(root, relative);
  assertWritable(clean);
  if (!clean) throw new PathError("Choose a name.");
  if (fs.existsSync(absolute)) throw new PathError("Something with that name already exists.", 409);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (kind === "dir") fs.mkdirSync(absolute);
  else fs.writeFileSync(absolute, "", { flag: "wx" });
  return { path: clean };
}

export function renameEntry(root: string, from: string, to: string) {
  const source = resolveInside(root, from);
  const target = resolveInside(root, to);
  assertWritable(source.relative);
  assertWritable(target.relative);
  if (!source.relative || !target.relative) throw new PathError("The workspace root cannot be renamed.");
  if (!fs.existsSync(source.absolute)) throw new PathError("Nothing to rename there.", 404);
  if (fs.existsSync(target.absolute)) throw new PathError("Something with that name already exists.", 409);
  if (target.relative.startsWith(`${source.relative}/`)) throw new PathError("A folder cannot be moved into itself.");
  fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
  fs.renameSync(source.absolute, target.absolute);
  return { path: target.relative };
}

/** Moves a file or folder to the workspace trash instead of erasing it. */
export function trashEntry(root: string, folder: string, relative: string) {
  const { absolute, relative: clean } = resolveInside(root, relative);
  assertWritable(clean);
  if (!clean) throw new PathError("The workspace root cannot be deleted here.");
  if (!fs.existsSync(absolute)) throw new PathError("Nothing to delete there.", 404);
  const destination = path.join(trashRoot, folder, `${Date.now()}`, clean);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(absolute, destination);
  return { path: clean };
}

type Walked = { relative: string; absolute: string; size: number };

/** Yields workspace files, skipping ignored folders, sensitive files, and symlinks. */
function* walk(root: string, limit: number): Generator<Walked> {
  const stack = [""];
  let seen = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(relative);
      } else if (entry.isFile() && !isSensitive(relative)) {
        const absolute = path.join(root, relative);
        const size = fs.statSync(absolute).size;
        yield { relative, absolute, size };
        if (++seen >= limit) return;
      }
    }
  }
}

export function listAllFiles(root: string, limit = 20_000) {
  return [...walk(root, limit)].map((file) => file.relative).sort();
}

export type SearchMatch = { path: string; line: number; column: number; preview: string };

export function searchFiles(
  root: string,
  query: string,
  options: { regex?: boolean; caseSensitive?: boolean; include?: string } = {},
) {
  if (!query) return { matches: [] as SearchMatch[], truncated: false, files: 0 };
  let pattern: RegExp;
  try {
    const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(source, options.caseSensitive ? "g" : "gi");
  } catch {
    throw new PathError("That regular expression is not valid.");
  }
  const include = options.include ? cleanRelative(options.include) : "";
  const matches: SearchMatch[] = [];
  const files = new Set<string>();
  const deadline = Date.now() + 5000;
  let truncated = false;
  for (const file of walk(root, 50_000)) {
    if (include && !file.relative.startsWith(include)) continue;
    if (file.size > 1024 * 1024) continue;
    const buffer = fs.readFileSync(file.absolute);
    if (looksBinary(buffer)) continue;
    const lines = buffer.toString("utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index]!;
      pattern.lastIndex = 0;
      const found = pattern.exec(text);
      if (!found) continue;
      files.add(file.relative);
      matches.push({
        path: file.relative,
        line: index + 1,
        column: found.index + 1,
        preview: text.length > 240 ? text.slice(Math.max(0, found.index - 80), found.index + 160) : text,
      });
      if (matches.length >= 2000) break;
    }
    if (matches.length >= 2000 || Date.now() > deadline) {
      truncated = true;
      break;
    }
  }
  return { matches, truncated, files: files.size };
}
