import { eq } from "drizzle-orm";
import { z } from "zod";
import { CURRENCIES } from "@/lib/billing/money";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/secrets";

const CONFIG_KEY = "billing.config";
const RAZORPAY_KEY = "billing.razorpay";

export const billingConfigSchema = z.object({
  companyName: z.string().trim().max(120).catch("CONZEX"),
  companyAddress: z.string().trim().max(500).catch(""),
  companyTaxId: z.string().trim().max(40).catch(""),
  supportEmail: z.string().trim().max(200).catch(""),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{1,12}$/)
    .catch("CZX"),
  /** Percent, e.g. 18 for GST. */
  taxRate: z.number().min(0).max(50).catch(0),
  taxLabel: z.string().trim().max(30).catch("GST"),
  /** Days before the due date that a renewal invoice is issued. */
  renewalLeadDays: z.number().int().min(0).max(60).catch(7),
  /** Days customers have to pay a new invoice. */
  paymentTermsDays: z.number().int().min(0).max(60).catch(7),
  defaultCurrency: z.enum(CURRENCIES).catch("INR"),
});

export type BillingConfig = z.infer<typeof billingConfigSchema>;

function read(key: string) {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  const now = Date.now();
  const json = JSON.stringify(value);
  db.insert(settings)
    .values({ key, value: json, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: now } })
    .run();
}

export function getBillingConfig(): BillingConfig {
  return billingConfigSchema.parse(read(CONFIG_KEY) ?? {});
}

export function saveBillingConfig(patch: Partial<BillingConfig>) {
  const next = billingConfigSchema.parse({ ...getBillingConfig(), ...patch });
  write(CONFIG_KEY, next);
  return next;
}

type StoredRazorpay = {
  keyId?: string;
  secretEnc?: string;
  secretHint?: string;
  webhookSecretEnc?: string;
  webhookSecretHint?: string;
};

function stored(): StoredRazorpay {
  const value = read(RAZORPAY_KEY);
  return value && typeof value === "object" ? (value as StoredRazorpay) : {};
}

/** What the admin screen may show. Secrets never leave the server. */
export function razorpayPublic() {
  const value = stored();
  return {
    keyId: value.keyId ?? "",
    hasSecret: Boolean(value.secretEnc),
    secretHint: value.secretHint ?? null,
    hasWebhookSecret: Boolean(value.webhookSecretEnc),
    webhookSecretHint: value.webhookSecretHint ?? null,
    mode: value.keyId?.startsWith("rzp_live_") ? ("live" as const) : value.keyId ? ("test" as const) : null,
  };
}

/** Undefined leaves a field as it is; an empty string clears it. */
export function saveRazorpay(patch: { keyId?: string; secret?: string; webhookSecret?: string }) {
  const value = stored();
  if (patch.keyId !== undefined) {
    const keyId = patch.keyId.trim();
    if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId)) {
      throw new Error("A Razorpay key ID looks like rzp_test_… or rzp_live_….");
    }
    value.keyId = keyId || undefined;
  }
  if (patch.secret !== undefined) {
    const secret = patch.secret.trim();
    value.secretEnc = secret ? encryptSecret(secret) : undefined;
    value.secretHint = secret ? secretHint(secret) : undefined;
  }
  if (patch.webhookSecret !== undefined) {
    const secret = patch.webhookSecret.trim();
    value.webhookSecretEnc = secret ? encryptSecret(secret) : undefined;
    value.webhookSecretHint = secret ? secretHint(secret) : undefined;
  }
  write(RAZORPAY_KEY, value);
  return razorpayPublic();
}

/** Server-only credentials, or null when online payment is not set up. */
export function razorpayCredentials() {
  const value = stored();
  if (!value.keyId || !value.secretEnc) return null;
  try {
    return { keyId: value.keyId, secret: decryptSecret(value.secretEnc) };
  } catch {
    return null;
  }
}

export function razorpayWebhookSecret() {
  const value = stored();
  if (!value.webhookSecretEnc) return null;
  try {
    return decryptSecret(value.webhookSecretEnc);
  } catch {
    return null;
  }
}
