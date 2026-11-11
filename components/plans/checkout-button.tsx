"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/lib/plans/types";

type WidgetCheckout = {
  mode: "widget";
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  planId: PlanId;
  merchantName: string;
  planName: string;
  description: string;
  prefill: { email: string; name: string };
  themeColor: string;
};

type RedirectCheckout = {
  mode: "redirect";
  sessionId: string;
  url: string;
  planId: PlanId;
};

type CheckoutPayload = (WidgetCheckout | RedirectCheckout) & { error?: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT_ID = "payment-checkout-sdk";
const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

async function loadCheckoutSdk() {
  if (window.Razorpay) return;
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load payment checkout.")), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load payment checkout."));
    document.head.appendChild(script);
  });
  if (!window.Razorpay) throw new Error("Could not load payment checkout.");
}

export function PlanCheckoutButton({
  planId,
  planName,
  priceLabel,
}: {
  planId: PlanId;
  planName: string;
  priceLabel?: string;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

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
        const body = (await response.json().catch(() => ({}))) as { error?: string };
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

  function pay() {
    start(async () => {
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const body = (await response.json().catch(() => ({}))) as CheckoutPayload;
        if (!response.ok) throw new Error(body.error ?? "Could not start checkout.");

        if (body.mode === "redirect") {
          window.location.href = body.url;
          return;
        }

        await loadCheckoutSdk();
        const order = body;
        await new Promise<void>((resolve, reject) => {
          const popup = new window.Razorpay!({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: order.merchantName,
            description: order.description,
            order_id: order.orderId,
            prefill: order.prefill,
            theme: { color: order.themeColor },
            handler: async (result: {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
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
                setOpen(false);
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
    <div className="space-y-2" data-upgrade-path="checkout">
      {!open ? (
        <Button type="button" className="w-full" onClick={() => setOpen(true)} data-checkout={planId}>
          Upgrade to {planName}
        </Button>
      ) : (
        <div className="rounded-xl border bg-muted/40 p-3" data-checkout-panel={planId}>
          <p className="text-sm font-medium">Confirm upgrade</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {priceLabel ? `${priceLabel} · ` : ""}
            Secure payment. Your plan updates as soon as payment succeeds.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="min-w-0 flex-1" disabled={pending} onClick={pay}>
              <Lock className="size-3.5" />
              {pending ? "Opening checkout…" : "Pay now"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
