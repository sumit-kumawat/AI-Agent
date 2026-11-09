export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CYCLES = ["monthly", "quarterly", "semiannually", "annually", "biennially", "triennially", "onetime"] as const;
export type Cycle = (typeof CYCLES)[number];

export const CYCLE_LABEL: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semiannually: "Every 6 months",
  annually: "Yearly",
  biennially: "Every 2 years",
  triennially: "Every 3 years",
  onetime: "One-time",
};

export const CYCLE_SHORT: Record<Cycle, string> = {
  monthly: "/mo",
  quarterly: "/3 mo",
  semiannually: "/6 mo",
  annually: "/yr",
  biennially: "/2 yr",
  triennially: "/3 yr",
  onetime: "once",
};

const CYCLE_MONTHS: Record<Cycle, number> = {
  monthly: 1,
  quarterly: 3,
  semiannually: 6,
  annually: 12,
  biennially: 24,
  triennially: 36,
  onetime: 0,
};

export function cycleMonths(cycle: Cycle) {
  return CYCLE_MONTHS[cycle];
}

/** The same day of the month `months` later, clamped to the month's last day. */
export function addMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}

export function formatMoney(minor: number, currency: Currency | string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

/** "1,499.00" or "1499" from a form field, as paise or cents. Null when blank or invalid. */
export function parseMoney(value: unknown) {
  const text = String(value ?? "").replace(/[,\s₹$]/g, "");
  if (!text) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function minorToInput(minor: number | null | undefined) {
  return minor === null || minor === undefined ? "" : (minor / 100).toFixed(2);
}

/** Tax on a subtotal, rounded half up to the minor unit. */
export function taxOn(subtotalMinor: number, rate: number) {
  return Math.round((subtotalMinor * rate) / 100);
}
