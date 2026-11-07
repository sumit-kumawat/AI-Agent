import fs from "node:fs";
import path from "node:path";
import * as nodePty from "node-pty";
import type { IPty } from "node-pty";
import { HttpError } from "@/lib/ide/guard";

const MAX_BUFFER = 256 * 1024;
const MAX_PER_USER = 8;
const IDLE_MS = 30 * 60 * 1000;

type Listener = (event: { type: "data"; data: string } | { type: "exit"; code: number }) => void;

export type TerminalSession = {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  pty: IPty;
  buffer: string;
  exitCode: number | null;
  listeners: Set<Listener>;
  createdAt: number;
  lastSeen: number;
};

const store = globalThis as unknown as { conzexTerminals?: Map<string, TerminalSession>; conzexTerminalSweep?: NodeJS.Timeout };
const sessions = (store.conzexTerminals ??= new Map());

store.conzexTerminalSweep ??= setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.listeners.size === 0 && now - session.lastSeen > IDLE_MS) closeTerminal(session.id);
  }
}, 60_000).unref();

let helperChecked = false;

/** npm installs node-pty's prebuilt spawn helper without the execute bit; restore it once. */
function loadPty() {
  if (!helperChecked) {
    helperChecked = true;
    const roots = [
      path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "node-pty"),
      path.join(/*turbopackIgnore: true*/ process.cwd(), ".next", "standalone", "node_modules", "node-pty"),
    ];
    for (const root of roots) {
      for (const helper of [
        path.join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
        path.join(root, "build", "Release", "spawn-helper"),
      ]) {
        try {
          if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
        } catch {
          // Read-only installs must already be executable.
        }
      }
    }
  }
  return nodePty;
}

const SECRET_ENV = /(SECRET|PASSWORD|TOKEN|_KEY$|^KEY$|HASH|CREDENTIAL)/i;

/** The server's environment minus anything secret, so shells cannot read app credentials. */
function shellEnv(root: string) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || SECRET_ENV.test(key)) continue;
    if (key.startsWith("AUTH_") || key.startsWith("ADMIN_") || key === "NODE_ENV" || key.startsWith("__NEXT")) continue;
    env[key] = value;
  }
  return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", CONZEX_WORKSPACE: root };
}

function defaultShell() {
  if (process.platform === "win32") return "powershell.exe";
  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];
  return candidates.find((shell) => shell && fs.existsSync(shell)) ?? "/bin/sh";
}

export function createTerminal(input: { workspaceId: string; userId: string; root: string; cols: number; rows: number }) {
  const mine = [...sessions.values()].filter((session) => session.userId === input.userId && session.exitCode === null);
  if (mine.length >= MAX_PER_USER) throw new HttpError(`You can have at most ${MAX_PER_USER} terminals open.`, 429);
  const shell = defaultShell();
  const processHandle = loadPty().spawn(shell, [], {
    name: "xterm-256color",
    cols: Math.min(Math.max(input.cols, 20), 500),
    rows: Math.min(Math.max(input.rows, 5), 200),
    cwd: input.root,
    env: shellEnv(input.root),
  });
  const id = crypto.randomUUID();
  const count = [...sessions.values()].filter((session) => session.workspaceId === input.workspaceId).length;
  const session: TerminalSession = {
    id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    title: `${path.basename(shell)} ${count + 1}`,
    pty: processHandle,
    buffer: "",
    exitCode: null,
    listeners: new Set(),
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  processHandle.onData((data) => {
    session.buffer = (session.buffer + data).slice(-MAX_BUFFER);
    for (const listener of session.listeners) listener({ type: "data", data });
  });
  processHandle.onExit(({ exitCode }) => {
    session.exitCode = exitCode;
    for (const listener of session.listeners) listener({ type: "exit", code: exitCode });
  });
  sessions.set(id, session);
  return session;
}

export function getTerminal(id: string, userId: string) {
  const session = sessions.get(id);
  if (!session || session.userId !== userId) throw new HttpError("Terminal not found.", 404);
  session.lastSeen = Date.now();
  return session;
}

export function listTerminals(workspaceId: string, userId: string) {
  return [...sessions.values()]
    .filter((session) => session.workspaceId === workspaceId && session.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function closeTerminal(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  if (session.exitCode === null) {
    try {
      session.pty.kill();
    } catch {
      // Already gone.
    }
  }
  sessions.delete(id);
}

/** The last output of a terminal as plain text, for AI context. */
export function terminalTail(session: TerminalSession, chars = 8000) {
  return session.buffer.slice(-chars).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, "");
}

export function publicTerminal(session: TerminalSession) {
  return { id: session.id, title: session.title, exitCode: session.exitCode, createdAt: session.createdAt };
}
