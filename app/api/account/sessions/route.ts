import { eq, sql } from "drizzle-orm";
import { apiUser, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Signs the user out on every device, including this one. */
export const DELETE = handler(async (request) => {
  const user = await apiUser(request);
  db.update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id))
    .run();
  audit(user, "account.sign_out_everywhere", { type: "user", id: user.id });
  return new Response(null, { status: 204 });
});
