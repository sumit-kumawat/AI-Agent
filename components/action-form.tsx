"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useFeedback } from "@/components/feedback";

export type FormResult = { ok: true; message?: string; redirect?: string } | { ok: false; error: string };

/**
 * Submits a form to a server action and reports the outcome in the app's
 * popups. Refreshes the page, or follows the action's redirect, on success.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  ...rest
}: {
  action: (form: FormData) => Promise<FormResult>;
  children: ReactNode;
  className?: string;
  confirm?: { title: string; description?: string; confirmLabel?: string; destructive?: boolean };
  resetOnSuccess?: boolean;
} & Omit<React.ComponentProps<"form">, "action" | "onSubmit">) {
  const router = useRouter();
  const feedback = useFeedback();
  const [pending, start] = useTransition();

  return (
    <form
      {...rest}
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        // Outside the transition: the dialog's state update would otherwise wait for the transition to end.
        if (confirm && !(await feedback.confirm(confirm))) return;
        start(async () => {
          const result = await action(data);
          if (!result.ok) {
            void feedback.notify({ tone: "error", title: "That didn't work", description: result.error });
            return;
          }
          if (result.message) feedback.toast(result.message);
          if (resetOnSuccess) form.reset();
          if (result.redirect) router.push(result.redirect);
          else router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
