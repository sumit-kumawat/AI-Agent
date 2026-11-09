import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/** Raw stored value for one settings key, or null. */
export function getSettingValue(key: string) {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSettingValue(key: string, value: string) {
  const now = Date.now();
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run();
}

export type SystemSettings = {
  /** Chat requests allowed per user per minute. */
  chatRateLimitPerMinute: number;
  registrationEnabled: boolean;
  /** Lowercased words or phrases rejected in chat input. */
  moderationKeywords: string[];
};

export const DEFAULT_SETTINGS: SystemSettings = {
  chatRateLimitPerMinute: 30,
  registrationEnabled: true,
  moderationKeywords: [],
};

const cache = globalThis as typeof globalThis & { harborSettings?: SystemSettings };

function load(): SystemSettings {
  const rows = db.select().from(settings).all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const parse = <T>(key: keyof SystemSettings, fallback: T): T => {
    if (stored[key] === undefined) return fallback;
    try {
      return JSON.parse(stored[key]) as T;
    } catch {
      return fallback;
    }
  };
  return {
    chatRateLimitPerMinute: parse("chatRateLimitPerMinute", DEFAULT_SETTINGS.chatRateLimitPerMinute),
    registrationEnabled: parse("registrationEnabled", DEFAULT_SETTINGS.registrationEnabled),
    moderationKeywords: parse("moderationKeywords", DEFAULT_SETTINGS.moderationKeywords),
  };
}

export function getSettings() {
  return (cache.harborSettings ??= load());
}

export function updateSettings(patch: Partial<SystemSettings>) {
  const now = Date.now();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      tx.insert(settings)
        .values({ key, value: JSON.stringify(value), updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
        .run();
    }
  });
  cache.harborSettings = undefined;
  return getSettings();
}
