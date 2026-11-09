import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getBillingConfig } from "@/lib/billing/config";
import { CURRENCIES, type Currency } from "@/lib/billing/money";
import { getBillingProfile } from "@/lib/billing/store";

export const CURRENCY_COOKIE = "cz_currency";

/** A signed-in customer's billing currency, else the visitor's choice, else the default. */
export async function visitorCurrency(): Promise<Currency> {
  const session = await auth();
  if (session?.user?.id) return getBillingProfile(session.user.id).currency;
  const chosen = (await cookies()).get(CURRENCY_COOKIE)?.value;
  if (chosen && (CURRENCIES as readonly string[]).includes(chosen)) return chosen as Currency;
  return getBillingConfig().defaultCurrency;
}
