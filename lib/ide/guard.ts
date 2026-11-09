import { redirect } from "next/navigation";
import type { AdminUser } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";
import { PathError } from "@/lib/ide/paths";
import { capabilityBlock, storageLimit } from "@/lib/plans/entitlements";
import { isStaff } from "@/lib/roles";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type IdeActor = {
  id: string;
  email: string;
  name: string;
  /** Set for admins: they may use the terminal and open any workspace. */
  admin: AdminUser | null;
  /** Bytes all of this user's workspaces may hold; null when unlimited. */
  storageLimit: number | null;
};

/**
 * IDE API guard: an active account whose plan includes the IDE (admins always),
 * and, for requests that change something, an Origin header from this site
 * (CSRF protection).
 */
export async function ideUser(request: Request): Promise<IdeActor> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError("Sign in first.", 401);
  const user = findUserById(session.user.id);
  if (!user || user.suspended) throw new HttpError("Sign in first.", 401);
  const block = capabilityBlock(user, "ide");
  if (block) throw new HttpError(block.message, 403, { block });
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) throw new HttpError("Cross-site request refused.", 403);
  }
  const admin = isStaff(user.role)
    ? { id: user.id, email: user.email, name: user.name, role: user.role === "superadmin" ? ("superadmin" as const) : ("admin" as const) }
    : null;
  return { id: user.id, email: user.email, name: user.name, admin, storageLimit: storageLimit(user, "ide") };
}

/** For IDE pages: signed-out visitors go to sign in, plans without the IDE to the plans page. */
export async function requireIdePage() {
  const session = await auth();
  const user = session?.user?.id ? findUserById(session.user.id) : undefined;
  if (!user || user.suspended) redirect("/login");
  const block = capabilityBlock(user, "ide");
  if (block) redirect(`/plans?highlight=${block.requiredPlan?.id ?? ""}`);
  const admin = isStaff(user.role) ? { id: user.id } : null;
  return { id: user.id, email: user.email, name: user.name, admin, storageLimit: storageLimit(user, "ide") };
}

/** The terminal runs real commands on the server, so it stays admin-only. */
export async function ideAdmin(request: Request): Promise<AdminUser> {
  const actor = await ideUser(request);
  if (!actor.admin) throw new HttpError("The terminal is available to admins only.", 403);
  return actor.admin;
}

/** Turns thrown errors into JSON responses without leaking internals. */
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, ...error.body }, { status: error.status });
  }
  if (error instanceof PathError) {
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
