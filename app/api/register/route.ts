import { hash } from "bcryptjs";
import { createUser, findUserByEmail } from "@/lib/db/queries";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(
    `register:${clientIp(request.headers)}`,
    10,
    60 * 60 * 1000,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

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
