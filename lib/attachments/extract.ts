import { kindForName, type AttachmentKind } from "@/lib/attachments/types";
import { inspectZip } from "@/lib/attachments/zip";

/** Text kept per file. Longer documents are marked truncated; the assistant is told. */
export const MAX_TEXT_CHARS = 1_000_000;
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
const MAX_SHEET_ROWS = 5000;
const PARSE_TIMEOUT_MS = 30_000;

export class FileRejected extends Error {}

export type Extracted = {
  mime: string;
  text: string;
  pages: number | null;
  truncated: boolean;
  warning: string | null;
};

const IMAGE_SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", test: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6)) },
  {
    mime: "image/webp",
    test: (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
  },
];

function cap(text: string) {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return clean.length > MAX_TEXT_CHARS
    ? { text: clean.slice(0, MAX_TEXT_CHARS), truncated: true }
    : { text: clean, truncated: false };
}

function withTimeout<T>(work: Promise<T>, what: string) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new FileRejected(`${what} took too long to read.`)), PARSE_TIMEOUT_MS).unref(),
    ),
  ]);
}

/** Strict UTF-8 with no NUL bytes; anything else is treated as binary. */
function decodeText(buffer: Buffer) {
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

function checkOffice(buffer: Buffer, required: string, label: string) {
  const zip = inspectZip(buffer);
  if (!zip.ok || !zip.entries.includes(required)) {
    throw new FileRejected(`This ${label} is damaged or is not really a ${label}.`);
  }
  if (zip.uncompressed > MAX_UNZIPPED_BYTES) {
    throw new FileRejected(`This ${label} expands to more than 200 MB and cannot be read.`);
  }
}

async function readPdf(buffer: Buffer) {
  if (buffer.toString("latin1", 0, 5) !== "%PDF-") throw new FileRejected("This file is not a valid PDF.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const document = await withTimeout(getDocumentProxy(new Uint8Array(buffer)), "This PDF");
    const { totalPages, text } = await withTimeout(extractText(document, { mergePages: false }), "This PDF");
    const joined = text.map((page, index) => `[Page ${index + 1}]\n${page.trim()}`).join("\n\n");
    const hasText = text.some((page) => page.trim().length > 0);
    return { text: hasText ? joined : "", pages: totalPages };
  } catch (error) {
    if (error instanceof FileRejected) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(message)) throw new FileRejected("This PDF is password-protected. Remove the password and try again.");
    throw new FileRejected("This PDF is damaged and could not be read.");
  }
}

async function readDocx(buffer: Buffer) {
  checkOffice(buffer, "word/document.xml", "Word document");
  const mammoth = await import("mammoth");
  try {
    const result = await withTimeout(mammoth.extractRawText({ buffer }), "This document");
    return result.value;
  } catch (error) {
    if (error instanceof FileRejected) throw error;
    throw new FileRejected("This Word document is damaged and could not be read.");
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cell = value as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: string };
    if (cell.richText) return cell.richText.map((part) => part.text).join("");
    if (cell.result !== undefined) return cellText(cell.result);
    if (cell.text !== undefined) return cellText(cell.text);
    if (cell.error) return cell.error;
    return "";
  }
  return String(value);
}

function csvField(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

async function readXlsx(buffer: Buffer) {
  checkOffice(buffer, "xl/workbook.xml", "spreadsheet");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await withTimeout(workbook.xlsx.load(buffer as unknown as ArrayBuffer), "This spreadsheet");
  } catch (error) {
    if (error instanceof FileRejected) throw error;
    throw new FileRejected("This spreadsheet is damaged and could not be read.");
  }
  const sheets: string[] = [];
  let clipped = false;
  for (const sheet of workbook.worksheets) {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
      if (number > MAX_SHEET_ROWS) {
        clipped = true;
        return;
      }
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map((value) => csvField(cellText(value))).join(","));
    });
    if (lines.length) sheets.push(`[Sheet: ${sheet.name}]\n${lines.join("\n")}`);
  }
  return { text: sheets.join("\n\n"), sheets: workbook.worksheets.length, clipped };
}

function xmlText(xml: string) {
  return xml
    .replace(/<\/a:p>/g, "\n")
    .replace(/<a:t[^>]*>([^<]*)<\/a:t>/g, "$1\u0000")
    .replace(/<[^>]+>/g, "")
    .replaceAll("\u0000", "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function readPptx(buffer: Buffer) {
  checkOffice(buffer, "ppt/presentation.xml", "presentation");
  const { default: JSZip } = await import("jszip");
  try {
    const zip = await withTimeout(JSZip.loadAsync(buffer), "This presentation");
    const number = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);
    const slides = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => number(a) - number(b));
    const parts: string[] = [];
    for (const path of slides) {
      const body = xmlText(await zip.file(path)!.async("string")).trim();
      const notesPath = `ppt/notesSlides/notesSlide${number(path)}.xml`;
      const notes = zip.file(notesPath) ? xmlText(await zip.file(notesPath)!.async("string")).trim() : "";
      parts.push(`[Slide ${number(path)}]\n${body}${notes ? `\nSpeaker notes: ${notes}` : ""}`);
    }
    return { text: parts.join("\n\n"), slides: slides.length };
  } catch (error) {
    if (error instanceof FileRejected) throw error;
    throw new FileRejected("This presentation is damaged and could not be read.");
  }
}

/** Plain text from RTF: control words and groups such as fonts and pictures are dropped. */
function rtfText(source: string) {
  if (!source.startsWith("{\\rtf")) throw new FileRejected("This file is not valid RTF.");
  const out: string[] = [];
  const skip: boolean[] = [false];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === "{") {
      skip.push(skip.at(-1)!);
      continue;
    }
    if (char === "}") {
      if (skip.length > 1) skip.pop();
      continue;
    }
    if (char === "\\") {
      const rest = source.slice(index + 1);
      const word = /^([a-z]+)(-?\d+)? ?/i.exec(rest);
      if (word) {
        index += word[0].length;
        const name = word[1]!;
        if (["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "object"].includes(name)) skip[skip.length - 1] = true;
        else if (!skip.at(-1) && (name === "par" || name === "line")) out.push("\n");
        else if (!skip.at(-1) && name === "tab") out.push("\t");
        else if (!skip.at(-1) && name === "u" && word[2]) out.push(String.fromCharCode(Number(word[2]) & 0xffff));
        continue;
      }
      const hex = /^'([0-9a-f]{2})/i.exec(rest);
      if (hex) {
        if (!skip.at(-1)) out.push(String.fromCharCode(parseInt(hex[1]!, 16)));
        index += 3;
        continue;
      }
      if (rest[0] === "*") skip[skip.length - 1] = true;
      else if (!skip.at(-1) && rest[0]) out.push(rest[0]);
      index += 1;
      continue;
    }
    if (!skip.at(-1) && char !== "\r" && char !== "\n") out.push(char);
  }
  return out.join("");
}

const ZIP_MAX_ENTRIES = 300;
const ZIP_MAX_READ = 60;
const ZIP_ENTRY_BYTES = 20 * 1024 * 1024;

/** Lists a ZIP and reads the supported files inside it, one level deep. */
async function readZip(buffer: Buffer) {
  const listing = inspectZip(buffer);
  if (!listing.ok) throw new FileRejected("This ZIP file is damaged or is not really a ZIP file.");
  if (listing.uncompressed > MAX_UNZIPPED_BYTES) throw new FileRejected("This ZIP expands to more than 200 MB and cannot be read.");
  if (listing.entries.length > ZIP_MAX_ENTRIES) throw new FileRejected(`This ZIP has more than ${ZIP_MAX_ENTRIES} entries.`);
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await withTimeout(JSZip.loadAsync(buffer), "This ZIP");
  } catch (error) {
    if (error instanceof FileRejected) throw error;
    throw new FileRejected("This ZIP is damaged or password-protected.");
  }
  const files = Object.values(zip.files).filter((entry) => !entry.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(entry.name));
  const sections: string[] = [];
  const skipped: string[] = [];
  let read = 0;
  for (const entry of files) {
    const kind = kindForName(entry.name);
    if (!kind || kind === "zip" || kind === "image" || read >= ZIP_MAX_READ) {
      skipped.push(entry.name);
      continue;
    }
    try {
      const bytes = Buffer.from(await withTimeout(entry.async("uint8array"), "This ZIP"));
      if (bytes.length > ZIP_ENTRY_BYTES) throw new FileRejected("too large");
      const inner = await extract(kind, bytes);
      if (inner.text) {
        sections.push(`[File in archive: ${entry.name}]\n${inner.text}`);
        read += 1;
      } else skipped.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }
  const header = `[Archive contents: ${files.length} file${files.length === 1 ? "" : "s"}]\n${files.map((entry) => `- ${entry.name}`).join("\n")}`;
  return { text: [header, ...sections].join("\n\n"), read, skipped: skipped.length, total: files.length };
}

/**
 * Checks that the bytes match the claimed type and pulls out the text the
 * assistant can read. Throws FileRejected with a message for the person.
 */
export async function extract(kind: AttachmentKind, buffer: Buffer): Promise<Extracted> {
  if (buffer.length === 0) throw new FileRejected("This file is empty.");
  switch (kind) {
    case "pptx": {
      const deck = await readPptx(buffer);
      const capped = cap(deck.text);
      return {
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ...capped,
        pages: deck.slides,
        warning: capped.text.replace(/\[Slide \d+\]/g, "").trim() ? (capped.truncated ? "Very long; only the first part can be read." : null) : "This presentation has no text.",
      };
    }
    case "rtf": {
      const decoded = buffer.toString("latin1");
      const capped = cap(rtfText(decoded));
      return { mime: "application/rtf", ...capped, pages: null, warning: capped.text ? null : "This document has no text." };
    }
    case "zip": {
      const archive = await readZip(buffer);
      const capped = cap(archive.text);
      return {
        mime: "application/zip",
        ...capped,
        pages: null,
        warning:
          archive.read === 0
            ? "No readable files inside; only the file list can be used."
            : archive.skipped
              ? `Read ${archive.read} of ${archive.total} files; images, nested archives and unsupported files are listed only.`
              : null,
      };
    }
    case "image": {
      const match = IMAGE_SIGNATURES.find((signature) => signature.test(buffer));
      if (!match) throw new FileRejected("This image is damaged or is not a PNG, JPEG, GIF or WebP file.");
      return { mime: match.mime, text: "", pages: null, truncated: false, warning: null };
    }
    case "pdf": {
      const { text, pages } = await readPdf(buffer);
      const capped = cap(text);
      return {
        mime: "application/pdf",
        ...capped,
        pages,
        warning: capped.text
          ? capped.truncated
            ? "Very long; only the first part can be read."
            : null
          : "No selectable text. If this is a scan, the assistant cannot read it.",
      };
    }
    case "docx": {
      const capped = cap(await readDocx(buffer));
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ...capped,
        pages: null,
        warning: capped.text ? (capped.truncated ? "Very long; only the first part can be read." : null) : "This document has no text.",
      };
    }
    case "xlsx": {
      const sheet = await readXlsx(buffer);
      const capped = cap(sheet.text);
      return {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ...capped,
        pages: null,
        warning: !capped.text
          ? "This spreadsheet has no data."
          : sheet.clipped || capped.truncated
            ? `Only the first ${MAX_SHEET_ROWS.toLocaleString("en-US")} rows of each sheet can be read.`
            : null,
      };
    }
    case "csv":
    case "text":
    case "code": {
      const decoded = decodeText(buffer);
      if (decoded === null) throw new FileRejected("This file is not plain UTF-8 text.");
      const capped = cap(decoded);
      return {
        mime: kind === "csv" ? "text/csv" : "text/plain",
        ...capped,
        pages: null,
        warning: capped.text ? (capped.truncated ? "Very long; only the first part can be read." : null) : "This file is empty.",
      };
    }
  }
}
