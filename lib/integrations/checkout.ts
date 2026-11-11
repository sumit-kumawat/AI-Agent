import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { paymentCredentials, paymentGatewayStatus } from "@/lib/integrations/config";
import { getPlans } from "@/lib/plans/config";
import { PLAN_IDS, type PlanId } from "@/lib/plans/types";
import { isStaff } from "@/lib/roles";

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function amountToMinorUnits(amount: number, currency: string) {
  const rounded = Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100));
  if (!Number.isFinite(rounded) || rounded < 1) throw new Error("This plan needs a price greater than zero before checkout.");
  return rounded;
}

export function checkoutAvailability() {
  const status = paymentGatewayStatus();
  if (!status.connected || !paymentCredentials()) {
    return { available: false as const, provider: status.provider, reason: status.reason };
  }
  return {
    available: true as const,
    provider: status.provider as "razorpay" | "stripe",
    currency: status.currency,
    keyId: status.keyId!,
    reason: status.reason,
  };
}

export function planForCheckout(planId: string) {
  if (!(PLAN_IDS as readonly string[]).includes(planId)) throw new Error("Unknown plan.");
  const plan = getPlans()[planId as PlanId];
  if (!plan.price) throw new Error("This plan has no price yet. Ask your administrator to set one.");
  if (plan.price.amount <= 0) throw new Error("This plan's price must be greater than zero for checkout.");
  return plan;
}

export function applyPaidPlan(userId: string, planId: PlanId, details: Record<string, unknown>) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error("Your account no longer exists.");
  if (user.suspended) throw new Error("This account is suspended.");
  if (isStaff(user.role)) throw new Error("Administrators are not limited by plans.");
  db.update(users)
    .set({ plan: planId, planStartedAt: Date.now() })
    .where(eq(users.id, userId))
    .run();
  audit({ id: "system", email: "checkout" }, "billing.plan.paid", { type: "user", id: userId }, {
    plan: planId,
    from: user.plan,
    ...details,
  });
}

function basicAuth(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function createRazorpayOrder(input: {
  userId: string;
  email: string;
  name: string;
  planId: PlanId;
}) {
  const creds = paymentCredentials();
  if (!creds || creds.provider !== "razorpay") throw new Error("Razorpay is not configured.");
  const plan = planForCheckout(input.planId);
  const currency = (plan.price!.currency || creds.currency).toUpperCase();
  const amount = amountToMinorUnits(plan.price!.amount, currency);
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: basicAuth(creds.keyId, creds.keySecret),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt: `plan_${input.planId}_${Date.now()}`.slice(0, 40),
      notes: { userId: input.userId, planId: input.planId },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!response.ok || !body.id) {
    throw new Error(body.error?.description ?? "Could not start Razorpay checkout.");
  }
  return {
    provider: "razorpay" as const,
    orderId: body.id,
    keyId: creds.keyId,
    amount,
    currency,
    planId: input.planId,
    planName: plan.name,
    description: `${plan.name} plan (${plan.price!.interval}ly)`,
    prefill: { email: input.email, name: input.name },
  };
}

export function verifyRazorpayPayment(orderId: string, paymentId: string, signature: string) {
  const creds = paymentCredentials();
  if (!creds || creds.provider !== "razorpay") throw new Error("Razorpay is not configured.");
  const expected = createHmac("sha256", creds.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  if (expected !== signature) throw new Error("Payment signature did not match.");
}

export async function createStripeCheckout(input: {
  userId: string;
  email: string;
  planId: PlanId;
  successUrl: string;
  cancelUrl: string;
}) {
  const creds = paymentCredentials();
  if (!creds || creds.provider !== "stripe") throw new Error("Stripe is not configured.");
  const plan = planForCheckout(input.planId);
  const currency = (plan.price!.currency || creds.currency).toLowerCase();
  const unitAmount = amountToMinorUnits(plan.price!.amount, currency);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("customer_email", input.email);
  params.set("client_reference_id", `${input.userId}:${input.planId}`);
  params.set("metadata[userId]", input.userId);
  params.set("metadata[planId]", input.planId);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", currency);
  params.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.set("line_items[0][price_data][product_data][name]", `${plan.name} plan`);
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${plan.tagline || plan.name} · billed ${plan.price!.interval}ly`,
  );
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${creds.keySecret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !body.url || !body.id) {
    throw new Error(body.error?.message ?? "Could not start Stripe checkout.");
  }
  return { provider: "stripe" as const, sessionId: body.id, url: body.url, planId: input.planId };
}

export async function confirmStripeSession(sessionId: string, userId: string) {
  const creds = paymentCredentials();
  if (!creds || creds.provider !== "stripe") throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { authorization: `Bearer ${creds.keySecret}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    payment_status?: string;
    metadata?: { userId?: string; planId?: string };
    error?: { message?: string };
  };
  if (!response.ok || !body.id) throw new Error(body.error?.message ?? "Could not verify Stripe payment.");
  if (body.payment_status !== "paid") throw new Error("Payment is not complete yet.");
  if (body.metadata?.userId !== userId) throw new Error("This checkout belongs to another account.");
  const planId = body.metadata?.planId;
  if (!planId || !(PLAN_IDS as readonly string[]).includes(planId)) throw new Error("Unknown plan on this checkout.");
  applyPaidPlan(userId, planId as PlanId, { provider: "stripe", sessionId: body.id });
  return { planId: planId as PlanId };
}
