import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Provider API keys are encrypted at rest with AES-256-GCM. The key is
 * SECRETS_KEY when set, otherwise derived from AUTH_SECRET. Changing either
 * makes stored keys unreadable; they have to be entered again.
 */
function encryptionKey() {
  const secret = process.env.SECRETS_KEY?.trim() || env.AUTH_SECRET;
  return scryptSync(secret, "conzex-ai-provider-keys-v1", 32);
}

let cached: Buffer | undefined;
function keyBytes() {
  return (cached ??= encryptionKey());
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, data]).toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const raw = Buffer.from(payload.replace(/^v1\./, ""), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Last four characters, safe to show in the admin UI. */
export function secretHint(secret: string) {
  const trimmed = secret.trim();
  return trimmed.length >= 8 ? `…${trimmed.slice(-4)}` : "saved";
}

/** Removes a secret from text that might be logged or shown. */
export function redact(text: string, secret: string | null | undefined) {
  let clean = text;
  if (secret && secret.length > 4) clean = clean.replaceAll(secret, "…");
  return clean.replace(/\b(?:sk|rk|key)-[A-Za-z0-9_\-]{8,}\b/g, "…").slice(0, 300);
}
