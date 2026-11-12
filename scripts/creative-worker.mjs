#!/usr/bin/env node
/**
 * CPU creative worker stub.
 * Polls creative_jobs, claims work, and fails honestly when engines are missing.
 * Does not fabricate progress or run GPU/ComfyUI inference.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) {
    try {
      process.loadEnvFile(full);
    } catch {
      // older Node without loadEnvFile — ignore; env may already be set
    }
  }
}

process.env.DATA_DIR ??= path.join(root, "data");

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const dbPath = path.join(process.env.DATA_DIR, "harbor.db");
const workerId = `cpu-${process.pid}`;
const POLL_MS = Number(process.env.CREATIVE_WORKER_POLL_MS || 2_000);

if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath}. Start the app once so migrations run.`);
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

function setting(key) {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? null;
}

function engineConfig() {
  const raw = setting("creative.engines");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function which(binary) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [binary], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function hasBinary(candidate) {
  if (!candidate) return false;
  const resolved = path.isAbsolute(candidate) ? candidate : which(candidate);
  if (!resolved || !fs.existsSync(resolved)) return false;
  const probe = spawnSync(resolved, ["-version"], { encoding: "utf8", timeout: 4_000 });
  if (!probe.error && (probe.status === 0 || probe.status === null)) return true;
  const help = spawnSync(resolved, ["--help"], { encoding: "utf8", timeout: 4_000 });
  return !help.error && help.status === 0;
}

async function hasComfy(url) {
  if (!url) return false;
  try {
    const base = new URL(url).origin;
    const response = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

const KIND_ENGINES = {
  "image.generate": ["comfyui"],
  "video.generate": ["comfyui", "ffmpeg"],
  "rembg.run": ["rembg"],
  "media.convert": ["ffmpeg"],
  "workflow.run": [],
};

async function engineAvailable(id) {
  const config = engineConfig();
  if (id === "ffmpeg") return hasBinary(config.ffmpegPath || "ffmpeg");
  if (id === "rembg") return hasBinary(config.rembgPath || "rembg");
  if (id === "comfyui") return hasComfy(config.comfyuiUrl);
  return false;
}

function claim() {
  const now = Date.now();
  const stale = now - 60_000;
  const tx = sqlite.transaction(() => {
    const row = sqlite
      .prepare(
        `SELECT * FROM creative_jobs
         WHERE status = 'queued'
            OR (status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?))
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get(stale);
    if (!row) return null;
    sqlite
      .prepare(
        `UPDATE creative_jobs
         SET status = 'running', worker = ?, locked_at = ?, heartbeat_at = ?,
             started_at = COALESCE(started_at, ?), updated_at = ?, error = NULL
         WHERE id = ?`,
      )
      .run(workerId, now, now, now, now, row.id);
    return sqlite.prepare("SELECT * FROM creative_jobs WHERE id = ?").get(row.id);
  });
  return tx();
}

function finish(id, status, error, result = {}) {
  const now = Date.now();
  sqlite
    .prepare(
      `UPDATE creative_jobs
       SET status = ?, error = ?, result = ?, progress = ?, finished_at = ?, updated_at = ?, locked_at = NULL
       WHERE id = ? AND worker = ?`,
    )
    .run(status, error, JSON.stringify(result), status === "succeeded" ? 1 : 0, now, now, id, workerId);
}

async function processJob(job) {
  const required = KIND_ENGINES[job.kind] || [];
  for (const engine of required) {
    if (!(await engineAvailable(engine))) {
      finish(
        job.id,
        "failed",
        `Engine missing: ${engine}. Install or configure it in Creative Settings, then retry.`,
      );
      console.log(`[${workerId}] job ${job.id} failed: missing ${engine}`);
      return;
    }
  }

  // Phase 1: even when engines are present, GPU/Comfy generation is deferred.
  if (job.kind === "image.generate" || job.kind === "video.generate" || job.kind === "workflow.run") {
    finish(
      job.id,
      "failed",
      "This job kind needs a later-phase GPU/ComfyUI worker. Engines may be configured, but generation is not enabled yet.",
    );
    console.log(`[${workerId}] job ${job.id} deferred (${job.kind})`);
    return;
  }

  if (job.kind === "media.convert" || job.kind === "rembg.run") {
    // Honest no-op: engines exist, but full CPU pipelines land with media/rembg wiring.
    finish(
      job.id,
      "failed",
      `${job.kind} CPU pipeline is stubbed in Phase 1. Engines were detected; implement conversion/removal in a later phase.`,
    );
    console.log(`[${workerId}] job ${job.id} stubbed (${job.kind})`);
    return;
  }

  finish(job.id, "failed", `Unknown job kind: ${job.kind}`);
}

console.log(`[${workerId}] watching ${dbPath}`);

async function loop() {
  for (;;) {
    try {
      const job = claim();
      if (job) await processJob(job);
    } catch (error) {
      console.error(`[${workerId}]`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

void loop();

// Keep import.meta.url style consistent for tooling that rewrites this file.
void pathToFileURL;
