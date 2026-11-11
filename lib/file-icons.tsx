import { createElement } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { kindForName } from "@/lib/attachments/types";

/** Extension → Lucide icon. Kept in one place for the composer, trays and message chips. */
const BY_EXTENSION: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  rtf: FileText,
  txt: FileText,
  md: FileText,
  markdown: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  xlsm: FileSpreadsheet,
  csv: FileSpreadsheet,
  tsv: FileSpreadsheet,
  ppt: Presentation,
  pptx: Presentation,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
  zip: FileArchive,
  rar: FileArchive,
  "7z": FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  mp4: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  js: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  json: FileCode,
  html: FileCode,
  htm: FileCode,
  css: FileCode,
  scss: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
};

const BY_KIND: Record<string, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  docx: FileText,
  rtf: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  pptx: Presentation,
  text: FileText,
  code: FileCode,
  zip: FileArchive,
};

function extensionOf(filename: string) {
  const base = filename.toLowerCase().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

/** The Lucide icon for a file name. Falls back through kind, then File. */
export function getFileIcon(filename: string): LucideIcon {
  const extension = extensionOf(filename);
  if (extension && BY_EXTENSION[extension]) return BY_EXTENSION[extension]!;
  const kind = kindForName(filename);
  if (kind && BY_KIND[kind]) return BY_KIND[kind]!;
  return File;
}

/** Icon sized for trays and message chips. Inherits colour via currentColor. */
export function FileTypeIcon({
  filename,
  kind,
  className = "size-4",
}: {
  filename?: string;
  kind?: string | null;
  className?: string;
}) {
  const icon =
    (filename ? getFileIcon(filename) : null) ??
    (kind && BY_KIND[kind] ? BY_KIND[kind]! : File);
  return createElement(icon, { className, "aria-hidden": true });
}

export type { LucideIcon };
