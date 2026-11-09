import { hash } from "bcryptjs";
import { createUser, findUserByEmail } from "@/lib/db/queries";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { registerSchema } from "@/lib/validators";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!getSettings().registrationEnabled) {
    return Response.json(
      { error: "Registration is closed on this server. Ask an admin for an account." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const parsed = registerSchema.safeParse({
    name: typeof record.name === "string" ? record.name.trim() : record.name,
    email:
      typeof record.email === "string"
        ? record.email.trim().toLowerCase()
        : record.email,
    password: record.password,
  });

  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Enter a name, a valid email, and a password of 8 to 72 characters.",
      },
      { status: 400 },
    );
  }

  // Only requests that reach bcrypt are counted; typos and invalid forms are cheap.
  const ip = clientIp(request.headers);
  const context = { endpoint: "register", ip };
  const limited = ip
    ? rateLimit(`register:ip:${ip}`, 10, HOUR, context)
    : rateLimit("register:direct", 200, HOUR, context);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  if (findUserByEmail(parsed.data.email)) {
    return Response.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return Response.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }
    console.error("Failed to create user", error);
    return Response.json(
      { error: "Could not create the account." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 201 });
}
