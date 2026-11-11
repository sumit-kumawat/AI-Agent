import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";
import {
  applyPaidPlan,
  checkoutAvailability,
  confirmStripeSession,
  planForCheckout,
  verifyRazorpayPayment,
} from "@/lib/integrations/checkout";
import { PLAN_IDS } from "@/lib/plans/types";
import { isStaff } from "@/lib/roles";

export const dynamic = "force-dynamic";

const razorpaySchema = z.object({
  provider: z.literal("razorpay"),
  planId: z.enum(PLAN_IDS),
  orderId: z.string().trim().min(1).max(120),
  paymentId: z.string().trim().min(1).max(120),
  signature: z.string().trim().min(1).max(200),
});

const stripeSchema = z.object({
  provider: z.literal("stripe"),
  sessionId: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Signed out." }, { status: 401 });
  const user = findUserById(session.user.id);
  if (!user) return NextResponse.json({ error: "Signed out." }, { status: 401 });
  if (isStaff(user.role)) {
    return NextResponse.json({ error: "Administrators are not limited by plans." }, { status: 400 });
  }

  const availability = checkoutAvailability();
  if (!availability.available) {
    return NextResponse.json({ error: "Online checkout is not available yet." }, { status: 503 });
  }

  const raw = await request.json().catch(() => null);
  try {
    if (availability.provider === "razorpay") {
      const parsed = razorpaySchema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
      planForCheckout(parsed.data.planId);
      verifyRazorpayPayment(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature);
      applyPaidPlan(user.id, parsed.data.planId, {
        provider: "razorpay",
        orderId: parsed.data.orderId,
        paymentId: parsed.data.paymentId,
      });
      return NextResponse.json({ ok: true, planId: parsed.data.planId });
    }

    const parsed = stripeSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Missing Stripe session." }, { status: 400 });
    const result = await confirmStripeSession(parsed.data.sessionId, user.id);
    return NextResponse.json({ ok: true, planId: result.planId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not confirm payment." },
      { status: 400 },
    );
  }
}
