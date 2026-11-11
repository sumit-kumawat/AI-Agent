"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/lib/plans/types";

type RazorpayCheckout = {
  provider: "razorpay";
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  planId: PlanId;
  planName: string;
  description: string;
  prefill: { email: string; name: string };
};

type StripeCheckout = {
  provider: "stripe";
  sessionId: string;
  url: string;
  planId: PlanId;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

export function PlanCheckoutButton({
  planId,
  planName,
  providerLabel,
}: {
  planId: PlanId;
  planName: string;
  providerLabel: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    start(async () => {
      try {
        const response = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "stripe", sessionId }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string; planId?: string };
        if (!response.ok) throw new Error(body.error ?? "Payment confirmation failed.");
        window.history.replaceState({}, "", "/plans");
        void notify({ tone: "success", title: "Plan updated", description: "Your payment went through." });
        router.refresh();
      } catch (error) {
        void notify({
          tone: "error",
          title: "Payment not confirmed",
          description: error instanceof Error ? error.message : "Try again or contact your administrator.",
        });
      }
    });
  }, [notify, router]);

  function checkout() {
    start(async () => {
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const body = (await response.json().catch(() => ({}))) as (RazorpayCheckout | StripeCheckout) & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Could not start checkout.");

        if (body.provider === "stripe") {
          window.location.href = body.url;
          return;
        }

        await loadRazorpay();
        if (!window.Razorpay) throw new Error("Razorpay checkout did not load.");
        const order = body;
        await new Promise<void>((resolve, reject) => {
          const popup = new window.Razorpay!({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: order.planName,
            description: order.description,
            order_id: order.orderId,
            prefill: order.prefill,
            handler: async (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
              try {
                const confirm = await fetch("/api/billing/confirm", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    provider: "razorpay",
                    planId: order.planId,
                    orderId: result.razorpay_order_id,
                    paymentId: result.razorpay_payment_id,
                    signature: result.razorpay_signature,
                  }),
                });
                const confirmed = (await confirm.json().catch(() => ({}))) as { error?: string };
                if (!confirm.ok) throw new Error(confirmed.error ?? "Payment confirmation failed.");
                void notify({ tone: "success", title: "Plan updated", description: `You are now on ${planName}.` });
                router.refresh();
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            modal: {
              ondismiss: () => resolve(),
            },
          });
          popup.open();
        });
      } catch (error) {
        void notify({
          tone: "error",
          title: "Checkout failed",
          description: error instanceof Error ? error.message : "Try again or contact your administrator.",
        });
      }
    });
  }

  return (
    <Button type="button" className="w-full" disabled={pending} onClick={checkout} data-checkout={planId}>
      {pending ? "Starting checkout…" : `Upgrade with ${providerLabel}`}
    </Button>
  );
}
