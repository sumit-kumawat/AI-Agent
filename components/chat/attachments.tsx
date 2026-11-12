"use client";

import { AlertCircle, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ACCEPT_FILES,
  displayExtension,
  KIND_LABEL,
  kindForName,
  limitFor,
  MAX_FILES_PER_MESSAGE,
  unsupportedReason,
  type AttachmentInfo,
  type AttachmentKind,
} from "@/lib/attachments/types";
import { FileTypeIcon } from "@/lib/file-icons";
import { formatBytes } from "@/lib/format";

export type PendingFile = {
  key: string;
  name: string;
  size: number;
  kind: AttachmentKind | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
  info?: AttachmentInfo;
  preview?: string;
};

function upload(file: File, onProgress: (fraction: number) => void, signal: AbortSignal) {
  return new Promise<AttachmentInfo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachments");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { attachment?: AttachmentInfo; error?: string } | null;
      if (xhr.status === 201 && body?.attachment) resolve(body.attachment);
      else reject(new Error(body?.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

function removeOnServer(id: string) {
  void fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => undefined);
}

/** Files waiting in the composer. Each uploads as soon as it is added, so sending is instant. */
export function useAttachments(initial: AttachmentInfo[] = []) {
  const [items, setItems] = useState<PendingFile[]>(() =>
    initial.map((info) => ({
      key: info.id,
      name: info.name,
      size: info.size,
      kind: info.kind,
      status: "ready",
      progress: 1,
      info,
      preview: info.kind === "image" ? `/api/attachments/${info.id}` : undefined,
    })),
  );
  const controllers = useRef(new Map<string, AbortController>());
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);

  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active.values()) controller.abort();
      for (const item of latest.current) if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    };
  }, []);

  const patch = useCallback((key: string, next: Partial<PendingFile>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      upload(file, (progress) => patch(key, { progress }), controller.signal)
        .then((info) => {
          if (controller.signal.aborted) return removeOnServer(info.id);
          setItems((current) =>
            current.map((item) => {
              if (item.key !== key) return item;
              if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
              return {
                ...item,
                status: "ready",
                progress: 1,
                info,
                // Durable URL so chips survive after the composer clears blob previews.
                preview: info.kind === "image" ? `/api/attachments/${info.id}` : undefined,
              };
            }),
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          patch(key, { status: "error", error: error instanceof Error ? error.message : "Upload failed." });
        })
        .finally(() => controllers.current.delete(key));
    },
    [patch],
  );

  /** Returns a message for files that were refused before uploading, or null. */
  const add = useCallback(
    (files: File[], replaceKey?: string) => {
      const room = MAX_FILES_PER_MESSAGE - latest.current.length + (replaceKey ? 1 : 0);
      const accepted = files.slice(0, Math.max(0, room));
      const problems: string[] = [];
      if (files.length > accepted.length) problems.push(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
      const next: PendingFile[] = [];
      for (const file of accepted) {
        const kind = kindForName(file.name);
        const key = crypto.randomUUID();
        const base = { key, name: file.name, size: file.size, kind, progress: 0 };
        // Skip an identical file already waiting in the tray (same name and size).
        const duplicate = latest.current.some(
          (item) =>
            item.key !== replaceKey &&
            item.name === file.name &&
            item.size === file.size &&
            (item.status === "ready" || item.status === "uploading"),
        );
        if (duplicate) {
          problems.push(`${file.name} is already attached.`);
          continue;
        }
        if (!kind) {
          next.push({ ...base, status: "error", error: unsupportedReason(file.name) });
        } else if (file.size === 0) {
          next.push({ ...base, status: "error", error: "This file is empty." });
        } else if (file.size > limitFor(kind)) {
          next.push({ ...base, status: "error", error: `Larger than the ${formatBytes(limitFor(kind))} limit.` });
        } else {
          next.push({ ...base, status: "uploading", preview: kind === "image" ? URL.createObjectURL(file) : undefined });
          start(key, file);
        }
      }
      setItems((current) => {
        if (!replaceKey) return [...current, ...next];
        const index = current.findIndex((item) => item.key === replaceKey);
        const copy = [...current];
        copy.splice(index < 0 ? copy.length : index, index < 0 ? 0 : 1, ...next);
        return copy;
      });
      return problems.length ? problems.join(" ") : null;
    },
    [start],
  );

  const discard = useCallback((item: PendingFile, deleteStored: boolean) => {
    controllers.current.get(item.key)?.abort();
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    if (deleteStored && item.info) removeOnServer(item.info.id);
  }, []);

  const remove = useCallback(
    (key: string) => {
      const item = latest.current.find((entry) => entry.key === key);
      if (item) discard(item, true);
      setItems((current) => current.filter((entry) => entry.key !== key));
    },
    [discard],
  );

  const replace = useCallback(
    (key: string, file: File) => {
      const item = latest.current.find((entry) => entry.key === key);
      if (item) discard(item, true);
      return add([file], key);
    },
    [add, discard],
  );

  /** After sending: the files now belong to the message, so nothing is deleted. */
  const clear = useCallback(() => {
    for (const item of latest.current) discard(item, false);
    setItems([]);
  }, [discard]);

  const ready = items.flatMap((item) => (item.status === "ready" && item.info ? [item.info] : []));
  return {
    items,
    ready,
    uploading: items.some((item) => item.status === "uploading"),
    failed: items.some((item) => item.status === "error"),
    add,
    remove,
    replace,
    clear,
  };
}

export type Attachments = ReturnType<typeof useAttachments>;

const KIND_SAMPLE: Record<AttachmentKind, string> = {
  image: "photo.png",
  pdf: "doc.pdf",
  docx: "doc.docx",
  rtf: "doc.rtf",
  xlsx: "sheet.xlsx",
  csv: "data.csv",
  pptx: "deck.pptx",
  text: "notes.txt",
  code: "main.js",
  zip: "archive.zip",
};

export function KindIcon({
  kind,
  filename,
  className = "size-4 text-muted-foreground",
}: {
  kind?: AttachmentKind | null;
  filename?: string;
  className?: string;
}) {
  return <FileTypeIcon filename={filename ?? (kind ? KIND_SAMPLE[kind] : "file")} className={className} />;
}

/** A muted tile with the file-type icon. */
export function KindTile({ kind, filename }: { kind?: AttachmentKind | null; filename?: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <KindIcon kind={kind} filename={filename} className="size-4" />
    </span>
  );
}

/** The file name with its extension always visible, even when the rest is cut short. */
export function FileName({ name, className = "" }: { name: string; className?: string }) {
  const extension = displayExtension(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  return (
    <span className={`relative flex min-w-0 text-sm font-medium ${className}`} title={name}>
      <span className="sr-only">{name}</span>
      <span className="truncate" aria-hidden>
        {stem}
      </span>
      {extension ? (
        <span className="shrink-0" data-extension={extension} aria-hidden>
          {extension}
        </span>
      ) : null}
    </span>
  );
}

function describe(kind: AttachmentKind | null, size: number, pages?: number | null) {
  const unit = kind === "pptx" ? "slide" : "page";
  return [kind ? KIND_LABEL[kind] : "File", pages ? `${pages} ${unit}${pages === 1 ? "" : "s"}` : null, formatBytes(size)]
    .filter(Boolean)
    .join(" · ");
}

export function AttachmentTray({ files, disabled }: { files: Attachments; disabled?: boolean }) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  if (files.items.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pt-3 pb-1" data-attachment-tray>
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT_FILES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replacing.current) files.replace(replacing.current, file);
          event.target.value = "";
        }}
      />
      {files.items.map((item) => (
        <div
          key={item.key}
          data-attachment={item.status}
          className={`relative flex w-56 shrink-0 items-center gap-2.5 rounded-2xl border bg-background p-2 pr-8 ${
            item.status === "error" ? "border-destructive/40" : ""
          }`}
        >
          {item.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob or same-origin preview
            <img src={item.preview} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <KindTile kind={item.kind} filename={item.name} />
          )}
          <div className="min-w-0 flex-1">
            <FileName name={item.name} />
            {item.status === "error" ? (
              <p className="flex items-center gap-1 text-xs text-destructive" role="alert" title={item.error}>
                <AlertCircle className="mt-0.5 size-3 shrink-0 self-start" />
                <span className="line-clamp-2">{item.error}</span>
              </p>
            ) : item.status === "uploading" ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-upload-status={item.progress >= 1 ? "reading" : "uploading"}>
                <Loader2 className="size-3 shrink-0 animate-spin" />
                <span className="shrink-0">{item.progress >= 1 ? "Reading…" : `${Math.round(item.progress * 100)}%`}</span>
                <div className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1 text-xs text-muted-foreground" title={item.info?.warning ?? undefined} data-upload-status="ready">
                {item.info?.warning ? <TriangleAlert className="size-3 shrink-0 text-amber-600" aria-label="Note" /> : null}
                <span className="truncate">{describe(item.kind, item.size, item.info?.pages)}</span>
              </p>
            )}
          </div>
          <div className="absolute top-1 right-1 flex flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label={`Remove ${item.name}`}
              title="Remove"
              disabled={disabled}
              onClick={() => files.remove(item.key)}
            >
              <X className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label={`Replace ${item.name}`}
              title="Replace"
              disabled={disabled}
              onClick={() => {
                replacing.current = item.key;
                replaceInput.current?.click();
              }}
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Files shown above a sent message. */
export function MessageAttachments({ files }: { files: AttachmentInfo[] }) {
  if (!files?.length) return null;
  return (
    <div className="flex w-full max-w-[85%] flex-wrap justify-end gap-2 sm:max-w-[75%]" data-message-attachments>
      {files.map((file) =>
        file.kind === "image" ? (
          <a
            key={file.id}
            href={`/api/attachments/${file.id}`}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-2xl border bg-card shadow-sm"
            title={`${file.name} · ${formatBytes(file.size)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-only route, not optimisable */}
            <img
              src={`/api/attachments/${file.id}`}
              alt={file.name}
              className="max-h-48 max-w-60 object-cover"
              loading="lazy"
            />
            <span className="flex max-w-60 items-center gap-2 border-t px-2.5 py-1.5">
              <KindIcon kind={file.kind} filename={file.name} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-left">
                <FileName name={file.name} className="text-xs" />
                <span className="block truncate text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
              </span>
            </span>
          </a>
        ) : (
          <a
            key={file.id}
            href={`/api/attachments/${file.id}?download=1`}
            className="flex min-w-44 max-w-56 items-center gap-2.5 rounded-2xl border bg-card p-2 shadow-sm hover:bg-muted"
            title={file.warning ? `${file.name}\n${file.warning}` : `${file.name} · ${formatBytes(file.size)}`}
          >
            <KindTile kind={file.kind} filename={file.name} />
            <span className="min-w-0 flex-1 text-left">
              <FileName name={file.name} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {file.warning ? <TriangleAlert className="size-3 shrink-0 text-amber-600" aria-label="Note" /> : null}
                <span className="truncate">{describe(file.kind, file.size, file.pages)}</span>
              </span>
            </span>
          </a>
        ),
      )}
    </div>
  );
}
