import { audit } from "@/lib/audit";
import { HttpError, errorResponse, ideAdmin, readJson } from "@/lib/ide/guard";
import { closeTerminal, getTerminal } from "@/lib/ide/terminals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

type Params = { params: Promise<{ id: string }> };

/** Server-Sent Events: replays recent output, then streams new output until the client leaves. */
export async function GET(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const session = getTerminal((await params).id, admin.id);
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            cleanup();
          }
        };
        if (session.buffer) send("data", session.buffer);
        if (session.exitCode !== null) send("exit", session.exitCode);
        const listener = (event: { type: "data"; data: string } | { type: "exit"; code: number }) =>
          event.type === "data" ? send("data", event.data) : send("exit", event.code);
        session.listeners.add(listener);
        const heartbeat = setInterval(() => {
          session.lastSeen = Date.now();
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            cleanup();
          }
        }, 15_000);
        cleanup = () => {
          clearInterval(heartbeat);
          session.listeners.delete(listener);
          session.lastSeen = Date.now();
        };
        request.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Sends keystrokes ({ input }) or a new size ({ cols, rows }). */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const session = getTerminal((await params).id, admin.id);
    const body = await readJson<{ input?: unknown; cols?: unknown; rows?: unknown }>(request);
    if (session.exitCode !== null) throw new HttpError("This terminal has exited.", 409);
    if (typeof body.input === "string") {
      if (body.input.length > 64 * 1024) throw new HttpError("Input too large.", 413);
      session.pty.write(body.input);
    }
    if (typeof body.cols === "number" && typeof body.rows === "number") {
      session.pty.resize(Math.min(Math.max(Math.floor(body.cols), 20), 500), Math.min(Math.max(Math.floor(body.rows), 5), 200));
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const admin = await ideAdmin(request);
    const session = getTerminal((await params).id, admin.id);
    closeTerminal(session.id);
    audit(admin, "terminal.close", { type: "workspace", id: session.workspaceId }, { terminal: session.id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
