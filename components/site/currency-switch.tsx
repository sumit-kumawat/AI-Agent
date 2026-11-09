"use client";

import { useRouter } from "next/navigation";
import { CURRENCIES, type Currency } from "@/lib/billing/money";

export function CurrencySwitch({ value }: { value: Currency }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span>Currency</span>
      <select
        value={value}
        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
        onChange={(event) => {
          document.cookie = `cz_currency=${event.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </label>
  );
}
