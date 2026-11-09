import { createHmac, timingSafeEqual } from "node:crypto";
import { razorpayCredentials, razorpayWebhookSecret } from "@/lib/billing/config";
import { BillingError, recordGatewayOrder, type Invoice } from "@/lib/billing/store";
import { redact } from "@/lib/secrets";

const API = "https://api.razorpay.com/v1";

function hmac(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function sameHex(expected: string, received: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function razorpayReady() {
  return razorpayCredentials() !== null;
}

/** Creates a Razorpay order for the invoice total. Razorpay amounts are in paise or cents. */
export async function createRazorpayOrder(invoice: Invoice) {
  const credentials = razorpayCredentials();
  if (!credentials) throw new BillingError("Online payment is not set up yet. Contact us to pay this invoice.");
  const auth = Buffer.from(`${credentials.keyId}:${credentials.secret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: invoice.totalMinor,
        currency: invoice.currency,
        receipt: invoice.number,
        notes: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
  } catch {
    throw new BillingError("Could not reach Razorpay. Try again in a moment.");
  }
  const body = (await response.json().catch(() => null)) as
    | { id?: string; error?: { description?: string } }
    | null;
  if (!response.ok || !body?.id) {
    const reason = redact(body?.error?.description ?? `HTTP ${response.status}`, credentials.secret);
    throw new BillingError(`Razorpay refused the payment request: ${reason}`);
  }
  recordGatewayOrder(invoice, body.id);
  return { orderId: body.id, keyId: credentials.keyId };
}

/** Signature Razorpay Checkout returns to the browser after a successful payment. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const credentials = razorpayCredentials();
  if (!credentials) return false;
  return sameHex(hmac(credentials.secret, `${orderId}|${paymentId}`), signature);
}

/** X-Razorpay-Signature on webhooks: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = razorpayWebhookSecret();
  if (!secret || !signature) return false;
  return sameHex(hmac(secret, rawBody), signature);
}