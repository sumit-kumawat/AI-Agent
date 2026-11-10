const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];

const COUNTRY_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((country) => [country, "EUR"])),
  IN: "INR", US: "USD", GB: "GBP", AU: "AUD", CA: "CAD", NZ: "NZD", SG: "SGD", HK: "HKD", JP: "JPY", KR: "KRW",
  CN: "CNY", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", IS: "ISK",
  TR: "TRY", IL: "ILS", ZA: "ZAR", BR: "BRL", MX: "MXN", MY: "MYR", ID: "IDR", PH: "PHP", TH: "THB",
};

/** Currencies a visitor can pick; all are covered by the exchange-rate source. */
export const DISPLAY_CURRENCIES = [...new Set(["USD", "INR", "EUR", "GBP", ...Object.values(COUNTRY_CURRENCY)])].sort();
export const CURRENCY_COOKIE = "display-currency";

export type CurrencyGuess = { currency: string; source: "choice" | "network" | "language" | "default"; country: string | null };

/**
 * An approximate display currency for a visitor. Uses an explicit choice, then a
 * country header set by a CDN or proxy, then the browser language's region.
 * It only picks a currency; it says nothing about where someone is.
 */
export function guessCurrency(headers: Headers, chosen: string | undefined, fallback: string): CurrencyGuess {
  if (chosen && DISPLAY_CURRENCIES.includes(chosen)) return { currency: chosen, source: "choice", country: null };
  const network = (headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? headers.get("x-country-code") ?? "").toUpperCase();
  if (COUNTRY_CURRENCY[network]) return { currency: COUNTRY_CURRENCY[network], source: "network", country: network };
  for (const part of (headers.get("accept-language") ?? "").split(",")) {
    const region = part.split(";")[0].trim().split("-")[1]?.toUpperCase();
    if (region && COUNTRY_CURRENCY[region]) return { currency: COUNTRY_CURRENCY[region], source: "language", country: region };
  }
  return { currency: fallback, source: "default", country: null };
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount);
}
