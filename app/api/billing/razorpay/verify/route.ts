import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { verifyCheckoutSignature } from "@/lib/billing/razorpay";
import { applyPayment, BillingError, getInvoiceForUser, paymentByOrderId } from "@/lib/billing/store";

export const runtime = "nodejs";

const schema = z.object({
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Razorpay Checkout's success callback. The signature proves the payment belongs to our order. */
export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, schema);
  const payment = paymentByOrderId(body.razorpay_order_id);
  if (!payment || !getInvoiceForUser(payment.invoiceId, user.id)) throw new ApiError("Payment not found.", 404);
  if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    throw new ApiError("The payment could not be verified. If you were charged, it will be confirmed shortly.", 400);
  }
  try {
    const result = applyPayment({
      invoiceId: payment.invoiceId,
      gateway: "razorpay",
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof BillingError) throw new ApiError(error.message, 409);
    throw error;
  }
});
