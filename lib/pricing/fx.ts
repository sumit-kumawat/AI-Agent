import { getSettingValue, setSettingValue } from "@/lib/settings";

/** European Central Bank reference rates via Frankfurter: free, no key, published once per working day. */
const SOURCE = "https://api.frankfurter.dev/v1/latest";
export const FX_SOURCE_NAME = "European Central Bank reference rates";
const FRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;

export type FxTable = { base: string; date: string; rates: Record<string, number>; fetchedAt: number };

const memory = globalThis as typeof globalThis & { xaiFx?: Map<string, FxTable>; xaiFxFailedAt?: Map<string, number> };
const cache = (memory.xaiFx ??= new Map());
const failedAt = (memory.xaiFxFailedAt ??= new Map());

function stored(base: string): FxTable | null {
  const raw = getSettingValue(`fx.${base}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FxTable;
    return parsed.base === base && parsed.rates && typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Rates from `base` to other currencies. Fetched on the server and kept for
 * six hours; the last good table is stored so a source outage shows its date
 * rather than no conversion. Null when no rates have ever been fetched.
 */
export async function ratesFrom(base: string): Promise<FxTable | null> {
  const current = cache.get(base) ?? stored(base);
  if (current) cache.set(base, current);
  if (current && Date.now() - current.fetchedAt < FRESH_MS) return current;
  if (Date.now() - (failedAt.get(base) ?? 0) < RETRY_MS) return current;
  try {
    const response = await fetch(`${SOURCE}?from=${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { base?: string; date?: string; rates?: Record<string, unknown> };
    const rates = Object.fromEntries(
      Object.entries(body.rates ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0),
    );
    if (body.base !== base || !body.date || Object.keys(rates).length === 0) throw new Error("Unexpected response");
    const table: FxTable = { base, date: body.date, rates: { ...rates, [base]: 1 }, fetchedAt: Date.now() };
    cache.set(base, table);
    setSettingValue(`fx.${base}`, JSON.stringify(table));
    return table;
  } catch {
    failedAt.set(base, Date.now());
    return current;
  }
}

export type ConvertedPrice = {
  base: { amount: number; currency: string };
  /** Null when the visitor's currency is the base currency or no rate is available. */
  local: { amount: number; currency: string; rate: number; date: string; stale: boolean } | null;
  /** Why no local amount is shown, when one was wanted. */
  unavailable: string | null;
};

/** Converts a stored plan price for display. The base amount is never changed. */
export async function convertPrice(price: { amount: number; currency: string }, target: string): Promise<ConvertedPrice> {
  const base = { amount: price.amount, currency: price.currency };
  if (target === price.currency) return { base, local: null, unavailable: null };
  const table = await ratesFrom(price.currency);
  const rate = table?.rates[target];
  if (!table || !rate) {
    return {
      base,
      local: null,
      unavailable: table ? `${target} is not covered by the ${FX_SOURCE_NAME}.` : "Exchange rates are unavailable right now.",
    };
  }
  return {
    base,
    local: { amount: price.amount * rate, currency: target, rate, date: table.date, stale: Date.now() - table.fetchedAt > 2 * 24 * 60 * 60 * 1000 },
    unavailable: null,
  };
}
