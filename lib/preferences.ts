import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { preferencesSchema, type Preferences } from "@/lib/preferences-schema";

export function getPreferences(userId: string): Preferences {
  const row = db
    .select({ data: userPreferences.data })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  let stored: unknown = {};
  try {
    stored = row ? JSON.parse(row.data) : {};
  } catch {
    stored = {};
  }
  const parsed = preferencesSchema.safeParse(stored);
  return parsed.success ? parsed.data : preferencesSchema.parse({});
}

export function savePreferences(userId: string, patch: Partial<Preferences>): Preferences {
  const next = preferencesSchema.parse({ ...getPreferences(userId), ...patch });
  const now = Date.now();
  db.insert(userPreferences)
    .values({ userId, data: JSON.stringify(next), updatedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { data: JSON.stringify(next), updatedAt: now },
    })
    .run();
  return next;
}
