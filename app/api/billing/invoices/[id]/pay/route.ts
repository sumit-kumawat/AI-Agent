import { ApiError, apiUser, handler } from "@/lib/api";
import { createRazorpayOrder } from "@/lib/billing/razorpay";
import { BillingError, getInvoiceForUser } from "@/lib/billing/store";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = handler(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser(request);
  const limit = rateLimit(`pay:${user.id}`, 10, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const found = getInvoiceForUser((await params).id, user.id);
  if (!found) throw new ApiError("Invoice not found.", 404);
  if (found.invoice.status !== "unpaid") throw new ApiError("This invoice is not awaiting payment.", 409);
  try {
    const order = await createRazorpayOrder(found.invoice);
    return Response.json({
      keyId: order.keyId,
      orderId: order.orderId,
      amount: found.invoice.totalMinor,
      currency: found.invoice.currency,
      description: `Invoice ${found.invoice.number}`,
      prefill: { name: user.name, email: user.email },
    });
  } catch (error) {
    if (error instanceof BillingError) throw new ApiError(error.message, 409);
    throw error;
  }
});
