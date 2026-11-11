"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, type AdminUser } from "@/lib/admin";
import { audit } from "@/lib/audit";
import {
  publicIntegrations,
  updateFirebaseConfig,
  updatePaymentConfig,
  updateSmtpConfig,
} from "@/lib/integrations/config";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(work: (admin: AdminUser) => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    const admin = await adminAction();
    return { ok: true, ...(await work(admin)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

const optionalSecret = z.string().trim().max(500).optional().nullable();

const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(253),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().max(200),
  password: optionalSecret,
  fromEmail: z.string().trim().max(254),
  fromName: z.string().trim().max(120),
});

const paymentSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["none", "razorpay", "stripe"]),
  keyId: z.string().trim().max(200),
  keySecret: optionalSecret,
  webhookSecret: optionalSecret,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code such as INR or USD."),
});

const firebaseSchema = z.object({
  enabled: z.boolean(),
  apiKey: optionalSecret,
  authDomain: z.string().trim().max(253),
  projectId: z.string().trim().max(120),
  storageBucket: z.string().trim().max(253),
  messagingSenderId: z.string().trim().max(40),
  appId: z.string().trim().max(120),
  measurementId: z.string().trim().max(40),
});

export async function saveSmtpConfig(input: z.input<typeof smtpSchema>) {
  return run((admin) => {
    const parsed = smtpSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the SMTP form.");
    const data = parsed.data;
    if (data.enabled) {
      if (!data.host) throw new Error("Enter the SMTP host or turn SMTP off.");
      if (!data.fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.fromEmail)) {
        throw new Error("Enter a valid From email address.");
      }
      const current = publicIntegrations().smtp;
      if (!data.password && !current.passwordHint) throw new Error("Enter the SMTP password or turn SMTP off.");
    }
    const config = updateSmtpConfig(data);
    audit(admin, "integrations.smtp.update", { type: "settings", id: "integrations.smtp" }, {
      enabled: data.enabled,
      host: data.host || null,
      port: data.port,
      secure: data.secure,
      fromEmail: data.fromEmail || null,
      passwordChanged: Boolean(data.password),
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin");
    return { config };
  });
}

export async function savePaymentConfig(input: z.input<typeof paymentSchema>) {
  return run((admin) => {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the payment form.");
    const data = parsed.data;
    if (data.enabled) {
      if (data.provider === "none") throw new Error("Choose Razorpay or Stripe, or turn payments off.");
      if (!data.keyId) throw new Error("Enter the publishable / key id.");
      const current = publicIntegrations().payment;
      if (!data.keySecret && !current.keySecretHint) throw new Error("Enter the secret key or turn payments off.");
    }
    const config = updatePaymentConfig(data);
    audit(admin, "integrations.payment.update", { type: "settings", id: "integrations.payment" }, {
      enabled: data.enabled,
      provider: data.provider,
      currency: data.currency,
      keySecretChanged: Boolean(data.keySecret),
      webhookSecretChanged: Boolean(data.webhookSecret),
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin");
    return { config };
  });
}

export async function saveFirebaseConfig(input: z.input<typeof firebaseSchema>) {
  return run((admin) => {
    const parsed = firebaseSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the Firebase form.");
    const data = parsed.data;
    if (data.enabled) {
      if (!data.projectId) throw new Error("Enter the Firebase project id.");
      if (!data.authDomain) throw new Error("Enter the Firebase auth domain.");
      if (!data.appId) throw new Error("Enter the Firebase app id.");
      const current = publicIntegrations().firebase;
      if (!data.apiKey && !current.apiKeyHint) throw new Error("Enter the Firebase API key or turn Firebase off.");
    }
    const config = updateFirebaseConfig(data);
    audit(admin, "integrations.firebase.update", { type: "settings", id: "integrations.firebase" }, {
      enabled: data.enabled,
      projectId: data.projectId || null,
      authDomain: data.authDomain || null,
      apiKeyChanged: Boolean(data.apiKey),
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin");
    return { config };
  });
}
