/** Shared by the upload route and the composer. Nothing here touches the server. */

export type AttachmentKind = "image" | "pdf" | "docx" | "xlsx" | "pptx" | "csv" | "text" | "code" | "rtf" | "zip";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 10;
export const USER_STORAGE_BYTES = 500 * 1024 * 1024;

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp"];
const TEXT = [
  "txt", "md", "markdown", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "log", "ini", "toml", "rst", "tex",
  "svg", "conf", "cfg", "properties", "ipynb",
];
const CODE = [
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cc", "cpp",
  "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "css", "scss", "less", "vue", "svelte", "r", "lua", "pl", "dart",
  "scala", "ex", "exs", "erl", "hs", "clj", "m", "mm", "gradle", "tf", "proto", "graphql", "dockerfile", "makefile",
  "ps1", "bat", "vb", "fs", "zig", "nim", "jl", "sol", "prisma", "astro",
];

/** Names without a usable extension that are still text. */
const NAMED: Record<string, AttachmentKind> = {
  dockerfile: "code",
  makefile: "code",
  gemfile: "code",
  procfile: "code",
  jenkinsfile: "code",
  ".gitignore": "code",
  ".dockerignore": "code",
  ".editorconfig": "code",
  ".env.example": "text",
  readme: "text",
  license: "text",
};

/** Formats people often try that cannot be read, with what to do instead. */
export const UNSUPPORTED_HINT: Record<string, string> = {
  doc: "Old Word (.doc) files cannot be read. Save it as .docx or PDF.",
  xls: "Old Excel (.xls) files cannot be read. Save it as .xlsx or CSV.",
  ppt: "Old PowerPoint (.ppt) files cannot be read. Save it as .pptx or PDF.",
  heic: "HEIC photos cannot be read. Export it as JPEG or PNG.",
  rar: "RAR archives cannot be opened. Use a .zip file.",
  "7z": "7-Zip archives cannot be opened. Use a .zip file.",
  exe: "Programs cannot be attached.",
  dmg: "Disk images cannot be attached.",
};

export const EXTENSION_KIND: Record<string, AttachmentKind> = {
  ...Object.fromEntries(IMAGE.map((ext) => [ext, "image" as const])),
  ...Object.fromEntries(TEXT.map((ext) => [ext, "text" as const])),
  ...Object.fromEntries(CODE.map((ext) => [ext, "code" as const])),
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pptx: "pptx",
  csv: "csv",
  tsv: "csv",
  rtf: "rtf",
  zip: "zip",
};

/** Shown in the attach button's tooltip. */
export const SUPPORTED_SUMMARY = "PDF, Word, Excel, PowerPoint, CSV, text, Markdown, JSON, XML, code, images and ZIP";

/** `accept` value for file inputs: every extension this app can read. */
export const ACCEPT_FILES = Object.keys(EXTENSION_KIND)
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
  pptx: "Presentation",
  rtf: "Rich text",
  zip: "ZIP archive",
};

export function extensionOf(name: string) {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

/** The extension as written, with its dot (".pdf"), or "" when there is none. */
export function displayExtension(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot) : "";
}

export function kindForName(name: string): AttachmentKind | null {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? "";
  return NAMED[base] ?? EXTENSION_KIND[extensionOf(name)] ?? null;
}

/** Why a file cannot be attached, for the card. */
export function unsupportedReason(name: string) {
  return UNSUPPORTED_HINT[extensionOf(name)] ?? `${displayExtension(name) || "Files without an extension"} cannot be read. Supported: ${SUPPORTED_SUMMARY}.`;
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
