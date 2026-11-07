import { getSettings } from "@/lib/settings";

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns the first blocklisted keyword found in the text, or null. */
export function findBlockedKeyword(text: string) {
  const lower = text.toLowerCase();
  for (const keyword of getSettings().moderationKeywords) {
    // Whole-word match for plain words so "ass" does not block "class".
    const pattern = /^[\p{L}\p{N}]+$/u.test(keyword)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(keyword)}(?![\\p{L}\\p{N}])`, "u")
      : null;
    if (pattern ? pattern.test(lower) : lower.includes(keyword)) return keyword;
  }
  return null;
}

export function parseKeywords(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\n,]/)
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 0 && keyword.length <= 100),
    ),
  ].slice(0, 500);
}
