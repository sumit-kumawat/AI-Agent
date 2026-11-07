import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentConfig } from "@/lib/db/schema";

export type AgentConfig = typeof agentConfig.$inferSelect;

/** Agents with a runtime in this codebase. Others are registered but have no adapter yet. */
export const CONNECTED_AGENTS = new Set(["ollama"]);

export type RunningSession = {
  id: string;
  agentId: string;
  userId: string;
  userEmail: string;
  conversationId: string | null;
  model: string;
  startedAt: number;
};

type Entry = RunningSession & { controller: AbortController };

// Sessions are held in memory, so they are visible and killable only within this process.
const store = globalThis as typeof globalThis & {
  harborSessions?: Map<string, Entry>;
};
const sessions = (store.harborSessions ??= new Map<string, Entry>());

// A stream cannot outlive the chat route's maxDuration, so older entries are stale.
const MAX_SESSION_MS = 6 * 60 * 1000;

function sweep() {
  const cutoff = Date.now() - MAX_SESSION_MS;
  for (const [id, entry] of sessions) {
    if (entry.startedAt < cutoff) sessions.delete(id);
  }
}

export function listAgents() {
  return db.select().from(agentConfig).orderBy(asc(agentConfig.kind), asc(agentConfig.name)).all();
}

export function getAgent(id: string) {
  return db.select().from(agentConfig).where(eq(agentConfig.id, id)).get();
}

export function updateAgent(id: string, patch: { enabled?: boolean; maxConcurrency?: number }) {
  db.update(agentConfig)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(agentConfig.id, id))
    .run();
}

export function listSessions(): RunningSession[] {
  sweep();
  return [...sessions.values()]
    .map(({ id, agentId, userId, userEmail, conversationId, model, startedAt }) => ({
      id,
      agentId,
      userId,
      userEmail,
      conversationId,
      model,
      startedAt,
    }))
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function killSession(id: string) {
  const entry = sessions.get(id);
  if (!entry) return false;
  entry.controller.abort(new Error("Stopped by an administrator."));
  sessions.delete(id);
  return true;
}

type StartResult =
  | { ok: true; id: string; signal: AbortSignal; end: () => void }
  | { ok: false; status: number; error: string };

/**
 * Claims a concurrency slot for an agent. Every agent runtime must call this
 * before doing work, so the admin toggle and limit apply to all of them.
 */
export function startSession(
  input: Omit<RunningSession, "id" | "startedAt">,
  parentSignal?: AbortSignal,
): StartResult {
  sweep();
  const agent = getAgent(input.agentId);
  if (!agent || !CONNECTED_AGENTS.has(agent.id)) {
    return { ok: false, status: 503, error: "That agent is not available on this server." };
  }
  if (!agent.enabled) {
    return { ok: false, status: 503, error: `${agent.name} is turned off by an administrator.` };
  }
  const running = [...sessions.values()].filter((entry) => entry.agentId === agent.id).length;
  if (running >= agent.maxConcurrency) {
    return {
      ok: false,
      status: 429,
      error: "All chat slots are busy right now. Try again in a few seconds.",
    };
  }

  const id = crypto.randomUUID();
  const controller = new AbortController();
  const end = () => {
    sessions.delete(id);
  };
  parentSignal?.addEventListener("abort", () => controller.abort(parentSignal.reason), { once: true });
  controller.signal.addEventListener("abort", end, { once: true });
  sessions.set(id, { ...input, id, startedAt: Date.now(), controller });
  return { ok: true, id, signal: controller.signal, end };
}
