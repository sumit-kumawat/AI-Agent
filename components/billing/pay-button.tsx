"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";

type Order = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  prefill: { name: string; email: string };
};

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type RazorpayInstance = { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout. Check your connection."));
    document.head.append(script);
  });
}

export function PayButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/pay`, { method: "POST" });
      const body = (await response.json()) as Order & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Payment could not start.");
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: body.keyId,
        order_id: body.orderId,
        amount: body.amount,
        currency: body.currency,
        name: "CONZEX",
        description: body.description,
        prefill: body.prefill,
        theme: { color: "#10A37F" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (result: RazorpayResponse) => {
          const verify = await fetch("/api/billing/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });
          const outcome = (await verify.json()) as { error?: string };
          setBusy(false);
          if (!verify.ok) {
            void notify({ tone: "warning", title: "Payment received, confirmation pending", description: outcome.error });
          } else {
            toast("Payment received. Thank you.");
          }
          router.refresh();
        },
      });
      checkout.on("payment.failed", (event) => {
        void notify({ tone: "error", title: "Payment failed", description: event.error?.description ?? "Try another method." });
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      void notify({ tone: "error", title: "Payment could not start", description: error instanceof Error ? error.message : undefined });
    }
  }

  return (
    <Button type="button" onClick={() => void pay()} disabled={busy} className="rounded-full" data-pay>
      {busy ? "Opening Razorpay…" : label}
    </Button>
  );
}
