import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creativeEngines } from "@/lib/db/schema";
import { getSettingValue, setSettingValue } from "@/lib/settings";
import type { EngineId, EngineStatus } from "@/lib/creative/types";

const SETTINGS_KEY = "creative.engines";

type EngineConfig = {
  ffmpegPath?: string | null;
  comfyuiUrl?: string | null;
  rembgPath?: string | null;
};

function readConfig(): EngineConfig {
  const raw = getSettingValue(SETTINGS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as EngineConfig;
  } catch {
    return {};
  }
}

export function saveEngineConfig(patch: EngineConfig) {
  const next = { ...readConfig(), ...patch };
  setSettingValue(SETTINGS_KEY, JSON.stringify(next));
  return detectEngines();
}

function which(binary: string) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [binary], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const line = (result.stdout || "").split(/\r?\n/).map((part) => part.trim()).find(Boolean);
  return line || null;
}

function probeBinary(candidate: string | null | undefined) {
  if (!candidate) return null;
  const resolved = path.isAbsolute(candidate) ? candidate : which(candidate);
  if (!resolved || !fs.existsSync(resolved)) return null;
  const probe = spawnSync(resolved, ["-version"], { encoding: "utf8", timeout: 4_000 });
  if (probe.error || (probe.status !== 0 && probe.status !== null)) {
    // rembg uses `--help` more reliably than `-version`.
    const help = spawnSync(resolved, ["--help"], { encoding: "utf8", timeout: 4_000 });
    if (help.error || help.status !== 0) return null;
    return { path: resolved, detail: "Detected via --help" };
  }
  const first = (probe.stdout || probe.stderr || "").split(/\r?\n/)[0]?.trim() || "Detected";
  return { path: resolved, detail: first.slice(0, 160) };
}

async function probeComfy(url: string | null | undefined) {
  if (!url) return { available: false, url: null, detail: "No ComfyUI URL configured." as string | null };
  let base: string;
  try {
    base = new URL(url).origin;
  } catch {
    return { available: false, url, detail: "ComfyUI URL is invalid." };
  }
  try {
    const response = await fetch(`${base}/system_stats`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      return { available: false, url: base, detail: `ComfyUI responded ${response.status}.` };
    }
    return { available: true, url: base, detail: "ComfyUI /system_stats reachable." };
  } catch (error) {
    return {
      available: false,
      url: base,
      detail: error instanceof Error ? error.message : "ComfyUI unreachable.",
    };
  }
}

function upsertEngine(row: {
  id: EngineId;
  label: string;
  kind: string;
  available: boolean;
  path: string | null;
  url: string | null;
  detail: string | null;
}) {
  const now = Date.now();
  db.insert(creativeEngines)
    .values({ ...row, updatedAt: now })
    .onConflictDoUpdate({
      target: creativeEngines.id,
      set: {
        label: row.label,
        kind: row.kind,
        available: row.available,
        path: row.path,
        url: row.url,
        detail: row.detail,
        updatedAt: now,
      },
    })
    .run();
}

const SETUP: Record<EngineId, string> = {
  ffmpeg: "Install FFmpeg and ensure `ffmpeg` is on PATH, or set an absolute path in Creative Settings.",
  comfyui: "Run ComfyUI locally and paste its base URL (for example http://127.0.0.1:8188) in Creative Settings.",
  rembg: "Install rembg (`pip install rembg`) and ensure the `rembg` CLI is on PATH, or set its path in Creative Settings.",
};

/** Probe the host and refresh `creative_engines`. Returns live status for the UI. */
export async function detectEngines(): Promise<EngineStatus[]> {
  const config = readConfig();
  const ffmpeg = probeBinary(config.ffmpegPath || "ffmpeg");
  const rembg = probeBinary(config.rembgPath || "rembg");
  const comfy = await probeComfy(config.comfyuiUrl);

  const rows: EngineStatus[] = [
    {
      id: "ffmpeg",
      label: "FFmpeg",
      kind: "binary",
      available: Boolean(ffmpeg),
      path: ffmpeg?.path ?? (config.ffmpegPath || null),
      url: null,
      detail: ffmpeg?.detail ?? "FFmpeg not found on this host.",
      setup: SETUP.ffmpeg,
    },
    {
      id: "comfyui",
      label: "ComfyUI",
      kind: "service",
      available: comfy.available,
      path: null,
      url: comfy.url ?? (config.comfyuiUrl || null),
      detail: comfy.detail,
      setup: SETUP.comfyui,
    },
    {
      id: "rembg",
      label: "rembg",
      kind: "binary",
      available: Boolean(rembg),
      path: rembg?.path ?? (config.rembgPath || null),
      url: null,
      detail: rembg?.detail ?? "rembg CLI not found on this host.",
      setup: SETUP.rembg,
    },
  ];

  for (const row of rows) {
    upsertEngine({
      id: row.id,
      label: row.label,
      kind: row.kind,
      available: row.available,
      path: row.path,
      url: row.url,
      detail: row.detail,
    });
  }

  return rows;
}

export function listStoredEngines(): EngineStatus[] {
  const config = readConfig();
  const rows = db.select().from(creativeEngines).all();
  if (rows.length === 0) {
    return (["ffmpeg", "comfyui", "rembg"] as EngineId[]).map((id) => ({
      id,
      label: id === "ffmpeg" ? "FFmpeg" : id === "comfyui" ? "ComfyUI" : "rembg",
      kind: id === "comfyui" ? "service" : "binary",
      available: false,
      path: id === "ffmpeg" ? config.ffmpegPath || null : id === "rembg" ? config.rembgPath || null : null,
      url: id === "comfyui" ? config.comfyuiUrl || null : null,
      detail: "Not probed yet.",
      setup: SETUP[id],
    }));
  }
  return rows.map((row) => ({
    id: row.id as EngineId,
    label: row.label,
    kind: row.kind,
    available: row.available,
    path: row.path,
    url: row.url,
    detail: row.detail,
    setup: SETUP[row.id as EngineId] ?? "Configure this engine in Creative Settings.",
  }));
}

export function engineById(id: EngineId) {
  return db.select().from(creativeEngines).where(eq(creativeEngines.id, id)).get() ?? null;
}

export function engineConfig() {
  return readConfig();
}
