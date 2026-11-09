/** Shared by the upload route and the composer. Nothing here touches the server. */

export type AttachmentKind = "image" | "pdf" | "docx" | "xlsx" | "csv" | "text" | "code";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 10;
export const USER_STORAGE_BYTES = 500 * 1024 * 1024;

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp"];
const TEXT = ["txt", "md", "markdown", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "log", "ini", "toml", "rst", "tex"];
const CODE = [
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cc", "cpp",
  "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "css", "scss", "less", "vue", "svelte", "r", "lua", "pl", "dart",
  "scala", "ex", "exs", "erl", "hs", "clj", "m", "mm", "gradle", "tf", "proto", "graphql", "dockerfile", "makefile",
];

export const EXTENSION_KIND: Record<string, AttachmentKind> = {
  ...Object.fromEntries(IMAGE.map((ext) => [ext, "image" as const])),
  ...Object.fromEntries(TEXT.map((ext) => [ext, "text" as const])),
  ...Object.fromEntries(CODE.map((ext) => [ext, "code" as const])),
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  csv: "csv",
  tsv: "csv",
};

/** For the file picker's `accept` attribute. */
export const ACCEPT = Object.keys(EXTENSION_KIND)
  .map((ext) => `.${ext}`)
  .join(",");

export const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Image",
  pdf: "PDF",
  docx: "Word document",
  xlsx: "Spreadsheet",
  csv: "CSV",
  text: "Text",
  code: "Code",
};

export function extensionOf(name: string) {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? "";
  if (base === "dockerfile" || base === "makefile") return base;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

export function kindForName(name: string): AttachmentKind | null {
  return EXTENSION_KIND[extensionOf(name)] ?? null;
}

export function limitFor(kind: AttachmentKind) {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
}

/** What the browser is told about a stored file. */
export type AttachmentInfo = {
  id: string;
  name: string;
  kind: AttachmentKind;
  mime: string;
  size: number;
  /** Characters of text the assistant can read; 0 for images and files without text. */
  chars: number;
  pages: number | null;
  /** Shown under the file, e.g. "No selectable text — scanned PDF?". */
  warning: string | null;
};
