import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { applyPayment, BillingError, markPaymentFailed, paymentByOrderId } from "@/lib/billing/store";

export const runtime = "nodejs";

type Event = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; error_description?: string } };
  };
};

/**
 * Razorpay server-to-server events. Confirms payments even when the customer
 * closes the browser before Checkout calls back. Unknown or unsigned requests
 * are refused; repeats are harmless.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 100_000) return Response.json({ error: "Too large." }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const entity = event.payload?.payment?.entity;
  const orderId = entity?.order_id;
  if (!orderId) return Response.json({ ok: true, ignored: true });
  const payment = paymentByOrderId(orderId);
  if (!payment) return Response.json({ ok: true, ignored: true });

  if (event.event === "payment.failed") {
    markPaymentFailed(orderId, entity?.error_description ?? "Payment failed.");
    return Response.json({ ok: true });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return Response.json({ ok: true, ignored: true });
  }
  try {
    const result = applyPayment({
      invoiceId: payment.invoiceId,
      gateway: "razorpay",
      amountMinor: entity?.amount ?? -1,
      currency: entity?.currency ?? "",
      orderId,
      paymentId: entity?.id ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BillingError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
