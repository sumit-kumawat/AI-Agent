import { isAdmin, type AdminUser } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";
import { PathError } from "@/lib/ide/paths";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * IDE API guard: an active admin with their own password, and, for requests
 * that change something, an Origin header from this site (CSRF protection).
 */
export async function ideAdmin(request: Request): Promise<AdminUser> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError("Sign in first.", 401);
  if (!isAdmin(session.user)) throw new HttpError("Only admins can use the IDE.", 403);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) throw new HttpError("Cross-site request refused.", 403);
  }
  const user = findUserById(session.user.id)!;
  return { id: user.id, email: user.email, name: user.name, role: user.role === "superadmin" ? "superadmin" : "admin" };
}

/** Turns thrown errors into JSON responses without leaking internals. */
export function errorResponse(error: unknown) {
  if (error instanceof HttpError || error instanceof PathError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return Response.json({ error: "Not found." }, { status: 404 });
  if (code === "EACCES" || code === "EPERM") return Response.json({ error: "Permission denied." }, { status: 403 });
  if (code === "EEXIST" || code === "ENOTEMPTY") return Response.json({ error: "That already exists." }, { status: 409 });
  console.error("[ide]", error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  const body = (await request.json().catch(() => null)) as T | null;
  if (!body || typeof body !== "object") throw new HttpError("Send a JSON body.", 400);
  return body;
}
