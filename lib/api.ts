import type { z } from "zod";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Mutations must come from this site; browsers always send Origin on them. */
function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError("Missing origin.", 403);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("Bad origin.", 403);
  }
  if (!host || originHost !== host) throw new ApiError("Cross-site request refused.", 403);
}

/** The signed-in, active user making this request. */
export async function apiUser(request: Request) {
  assertSameOrigin(request);
  const session = await auth();
  const user = session?.user?.id ? findUserById(session.user.id) : undefined;
  if (!user || user.suspended) throw new ApiError("Unauthorized", 401);
  return user;
}

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("Invalid JSON.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  return parsed.data;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

/** Wraps a handler so thrown ApiErrors become JSON responses. */
export function handler<C>(fn: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C) => {
    try {
      return await fn(request, context);
    } catch (error) {
      return apiError(error);
    }
  };
}
