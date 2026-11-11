import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/secrets";

const SMTP_KEY = "integrations.smtp";
const PAYMENT_KEY = "integrations.payment";
const FIREBASE_KEY = "integrations.firebase";

type SecretField = { enc: string | null; hint: string | null };

type StoredSmtp = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: SecretField;
  fromEmail: string;
  fromName: string;
};

type StoredPayment = {
  enabled: boolean;
  provider: "none" | "razorpay" | "stripe";
  keyId: string;
  keySecret: SecretField;
  webhookSecret: SecretField;
  currency: string;
};

type StoredFirebase = {
  enabled: boolean;
  apiKey: SecretField;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

const SMTP_DEFAULTS: StoredSmtp = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: { enc: null, hint: null },
  fromEmail: "",
  fromName: "",
};

const PAYMENT_DEFAULTS: StoredPayment = {
  enabled: false,
  provider: "none",
  keyId: "",
  keySecret: { enc: null, hint: null },
  webhookSecret: { enc: null, hint: null },
  currency: "INR",
};

const FIREBASE_DEFAULTS: StoredFirebase = {
  enabled: false,
  apiKey: { enc: null, hint: null },
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

function loadJson<T>(key: string, defaults: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return structuredClone(defaults);
  try {
    return { ...structuredClone(defaults), ...(JSON.parse(row.value) as Partial<T>) };
  } catch {
    return structuredClone(defaults);
  }
}

function saveJson(key: string, value: unknown) {
  const now = Date.now();
  db.insert(settings)
    .values({ key, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
}

function applySecret(field: SecretField, next: string | null | undefined): SecretField {
  if (next === null) return { enc: null, hint: null };
  if (next === undefined || next === "") return field;
  const trimmed = next.trim();
  return { enc: encryptSecret(trimmed), hint: secretHint(trimmed) };
}

export type PublicSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordHint: string | null;
  fromEmail: string;
  fromName: string;
  configured: boolean;
};

export type PublicPaymentConfig = {
  enabled: boolean;
  provider: StoredPayment["provider"];
  keyId: string;
  keySecretHint: string | null;
  webhookSecretHint: string | null;
  currency: string;
  configured: boolean;
};

export type PublicFirebaseConfig = {
  enabled: boolean;
  apiKeyHint: string | null;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  configured: boolean;
};

export type PublicIntegrations = {
  smtp: PublicSmtpConfig;
  payment: PublicPaymentConfig;
  firebase: PublicFirebaseConfig;
};

function smtpPublic(value: StoredSmtp): PublicSmtpConfig {
  const configured = Boolean(value.host && value.fromEmail && value.password.enc);
  return {
    enabled: value.enabled,
    host: value.host,
    port: value.port,
    secure: value.secure,
    username: value.username,
    passwordHint: value.password.hint,
    fromEmail: value.fromEmail,
    fromName: value.fromName,
    configured,
  };
}

function paymentPublic(value: StoredPayment): PublicPaymentConfig {
  const configured = value.provider !== "none" && Boolean(value.keyId && value.keySecret.enc);
  return {
    enabled: value.enabled,
    provider: value.provider,
    keyId: value.keyId,
    keySecretHint: value.keySecret.hint,
    webhookSecretHint: value.webhookSecret.hint,
    currency: value.currency,
    configured,
  };
}

function firebasePublic(value: StoredFirebase): PublicFirebaseConfig {
  const configured = Boolean(value.projectId && value.appId && value.apiKey.enc && value.authDomain);
  return {
    enabled: value.enabled,
    apiKeyHint: value.apiKey.hint,
    authDomain: value.authDomain,
    projectId: value.projectId,
    storageBucket: value.storageBucket,
    messagingSenderId: value.messagingSenderId,
    appId: value.appId,
    measurementId: value.measurementId,
    configured,
  };
}

export function publicIntegrations(): PublicIntegrations {
  return {
    smtp: smtpPublic(loadJson(SMTP_KEY, SMTP_DEFAULTS)),
    payment: paymentPublic(loadJson(PAYMENT_KEY, PAYMENT_DEFAULTS)),
    firebase: firebasePublic(loadJson(FIREBASE_KEY, FIREBASE_DEFAULTS)),
  };
}

export type SmtpPatch = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string | null;
  fromEmail: string;
  fromName: string;
};

export type PaymentPatch = {
  enabled: boolean;
  provider: StoredPayment["provider"];
  keyId: string;
  keySecret?: string | null;
  webhookSecret?: string | null;
  currency: string;
};

export type FirebasePatch = {
  enabled: boolean;
  apiKey?: string | null;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

export function updateSmtpConfig(patch: SmtpPatch) {
  const value = loadJson(SMTP_KEY, SMTP_DEFAULTS);
  value.enabled = patch.enabled;
  value.host = patch.host.trim();
  value.port = patch.port;
  value.secure = patch.secure;
  value.username = patch.username.trim();
  value.fromEmail = patch.fromEmail.trim();
  value.fromName = patch.fromName.trim();
  value.password = applySecret(value.password, patch.password);
  saveJson(SMTP_KEY, value);
  return smtpPublic(value);
}

export function updatePaymentConfig(patch: PaymentPatch) {
  const value = loadJson(PAYMENT_KEY, PAYMENT_DEFAULTS);
  value.enabled = patch.enabled;
  value.provider = patch.provider;
  value.keyId = patch.keyId.trim();
  value.currency = patch.currency.trim().toUpperCase() || "INR";
  value.keySecret = applySecret(value.keySecret, patch.keySecret);
  value.webhookSecret = applySecret(value.webhookSecret, patch.webhookSecret);
  saveJson(PAYMENT_KEY, value);
  return paymentPublic(value);
}

export function updateFirebaseConfig(patch: FirebasePatch) {
  const value = loadJson(FIREBASE_KEY, FIREBASE_DEFAULTS);
  value.enabled = patch.enabled;
  value.authDomain = patch.authDomain.trim();
  value.projectId = patch.projectId.trim();
  value.storageBucket = patch.storageBucket.trim();
  value.messagingSenderId = patch.messagingSenderId.trim();
  value.appId = patch.appId.trim();
  value.measurementId = patch.measurementId.trim();
  value.apiKey = applySecret(value.apiKey, patch.apiKey);
  saveJson(FIREBASE_KEY, value);
  return firebasePublic(value);
}

/** Decrypted SMTP password for server-side mailers. Never send to the browser. */
export function smtpCredentials() {
  const value = loadJson(SMTP_KEY, SMTP_DEFAULTS);
  if (!value.enabled || !value.host || !value.password.enc) return null;
  try {
    return {
      host: value.host,
      port: value.port,
      secure: value.secure,
      username: value.username || null,
      password: decryptSecret(value.password.enc),
      fromEmail: value.fromEmail,
      fromName: value.fromName || null,
    };
  } catch {
    return null;
  }
}

/** Whether a payment provider has keys saved and is turned on. */
export function paymentGatewayStatus() {
  const value = paymentPublic(loadJson(PAYMENT_KEY, PAYMENT_DEFAULTS));
  if (!value.enabled || !value.configured) {
    return {
      connected: false as const,
      provider: value.provider,
      currency: value.currency,
      keyId: null as string | null,
      reason: "No payment gateway is connected, so there are no payments, subscriptions billed or revenue to report.",
    };
  }
  return {
    connected: true as const,
    provider: value.provider,
    currency: value.currency,
    keyId: value.keyId,
    reason: `Online checkout is enabled (${value.currency}). Plan changes apply as soon as payment succeeds.`,
  };
}

/** Server-only credentials for creating and verifying checkouts. Never send to the browser. */
export function paymentCredentials() {
  const value = loadJson(PAYMENT_KEY, PAYMENT_DEFAULTS);
  if (!value.enabled || value.provider === "none" || !value.keyId || !value.keySecret.enc) return null;
  try {
    return {
      provider: value.provider as "razorpay" | "stripe",
      keyId: value.keyId,
      keySecret: decryptSecret(value.keySecret.enc),
      webhookSecret: value.webhookSecret.enc ? decryptSecret(value.webhookSecret.enc) : null,
      currency: value.currency || "INR",
    };
  } catch {
    return null;
  }
}
