"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { jsonFetch } from "@/components/chat/conversation-actions";

export function QueueActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: "cancel" | "retry") {
    setBusy(true);
    try {
      await jsonFetch("/api/studio/jobs", { method: "PATCH", body: JSON.stringify({ id: jobId, action }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      {status === "queued" || status === "running" ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act("cancel")}>
          Cancel
        </Button>
      ) : null}
      {status === "failed" || status === "cancelled" ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act("retry")}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function DeleteAssetButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void jsonFetch("/api/studio/assets", { method: "DELETE", body: JSON.stringify({ id }) })
          .then(() => router.refresh())
          .finally(() => setBusy(false));
      }}
    >
      Delete
    </Button>
  );
}

export function EnqueueButton({
  kind,
  label,
  disabled,
  payload,
}: {
  kind: string;
  label: string;
  disabled?: boolean;
  payload?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={disabled || busy}
        data-generate
        onClick={() => {
          setBusy(true);
          setError(null);
          void jsonFetch("/api/studio/jobs", {
            method: "POST",
            body: JSON.stringify({ kind, payload }),
          })
            .then(() => router.push("/studio/queue"))
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Could not enqueue.");
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Queueing…" : label}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EngineSettingsForm({
  initial,
}: {
  initial: { ffmpegPath?: string | null; comfyuiUrl?: string | null; rembgPath?: string | null };
}) {
  const router = useRouter();
  const [ffmpegPath, setFfmpegPath] = useState(initial.ffmpegPath ?? "");
  const [comfyuiUrl, setComfyuiUrl] = useState(initial.comfyuiUrl ?? "");
  const [rembgPath, setRembgPath] = useState(initial.rembgPath ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(refreshOnly = false) {
    setBusy(true);
    setMessage(null);
    try {
      if (!refreshOnly) {
        await jsonFetch("/api/studio/engines", {
          method: "PATCH",
          body: JSON.stringify({
            ffmpegPath: ffmpegPath.trim() || null,
            comfyuiUrl: comfyuiUrl.trim() || null,
            rembgPath: rembgPath.trim() || null,
          }),
        });
      } else {
        await jsonFetch("/api/studio/engines?refresh=1");
      }
      setMessage(refreshOnly ? "Re-probed engines." : "Saved and re-probed engines.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>FFmpeg path</span>
        <input
          className="h-9 w-full rounded-lg border bg-background px-3"
          value={ffmpegPath}
          onChange={(event) => setFfmpegPath(event.target.value)}
          placeholder="ffmpeg or /usr/local/bin/ffmpeg"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>ComfyUI base URL</span>
        <input
          className="h-9 w-full rounded-lg border bg-background px-3"
          value={comfyuiUrl}
          onChange={(event) => setComfyuiUrl(event.target.value)}
          placeholder="http://127.0.0.1:8188"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>rembg path</span>
        <input
          className="h-9 w-full rounded-lg border bg-background px-3"
          value={rembgPath}
          onChange={(event) => setRembgPath(event.target.value)}
          placeholder="rembg"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>
          Re-detect
        </Button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}

export function CreateScheduleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void jsonFetch("/api/studio/schedules", {
          method: "POST",
          body: JSON.stringify({ name, cron, enabled: false }),
        })
          .then(() => {
            setName("");
            router.refresh();
          })
          .finally(() => setBusy(false));
      }}
    >
      <label className="space-y-1 text-sm">
        <span>Name</span>
        <input className="block h-9 rounded-lg border bg-background px-3" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="space-y-1 text-sm">
        <span>Cron</span>
        <input className="block h-9 rounded-lg border bg-background px-3 font-mono" value={cron} onChange={(e) => setCron(e.target.value)} required />
      </label>
      <Button type="submit" disabled={busy || !name.trim()}>
        Add schedule
      </Button>
    </form>
  );
}
