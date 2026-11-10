"use client";

import { Coins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CurrencyPicker({ value, options, cookie }: { value: string; options: string[]; cookie: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm" title="Currency used to show prices">
      <Coins className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Show prices in</span>
      <select
        value={value}
        disabled={pending}
        data-currency-picker
        className="bg-transparent outline-none"
        onChange={(event) => {
          document.cookie = `${cookie}=${event.target.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          startTransition(() => router.refresh());
        }}
      >
        {options.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </label>
  );
}
