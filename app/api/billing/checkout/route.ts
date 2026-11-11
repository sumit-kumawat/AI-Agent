import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";
import { checkoutAvailability, createRazorpayOrder, createStripeCheckout } from "@/lib/integrations/checkout";
import { PLAN_IDS } from "@/lib/plans/types";
import { isStaff } from "@/lib/roles";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  planId: z.enum(PLAN_IDS),
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
  if (user.plan === parsed.data.planId) {
    return NextResponse.json({ error: "You are already on this plan." }, { status: 400 });
  }

  try {
    if (availability.provider === "razorpay") {
      const order = await createRazorpayOrder({
        userId: user.id,
        email: user.email,
        name: user.name,
        planId: parsed.data.planId,
      });
      return NextResponse.json(order);
    }

    const origin = new URL(request.url).origin;
    const session = await createStripeCheckout({
      userId: user.id,
      email: user.email,
      planId: parsed.data.planId,
      successUrl: `${origin}/plans?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/plans?cancelled=1&highlight=${parsed.data.planId}`,
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start checkout." },
      { status: 400 },
    );
  }
}
