import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiUser, handler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

const schema = z.object({
  name: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Enter a name.").max(80, "Use at most 80 characters.")),
});

export const PATCH = handler(async (request) => {
  const user = await apiUser(request);
  const { name } = await parseBody(request, schema);
  db.update(users).set({ name }).where(eq(users.id, user.id)).run();
  return Response.json({ name });
});
