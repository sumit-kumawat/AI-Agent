/**
 * Domain availability from public RDAP, the registries' own lookup service.
 * A 404 from the registry means the name is not registered. This only checks
 * availability; registering a domain needs a registrar account, which CONZEX
 * handles through a request until a registrar is connected.
 */
export const POPULAR_TLDS = [".com", ".in", ".co.in", ".net", ".org", ".io", ".ai", ".co", ".online", ".store"];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normaliseDomain(input: string) {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]!;
  const labels = value.split(".");
  if (labels.length < 2 || value.length > 253 || !labels.every((label) => LABEL.test(label))) return null;
  if (!/^[a-z]{2,63}$/.test(labels.at(-1)!)) return null;
  return value;
}

/** "example" becomes example.com, example.in, … ; a full name is checked as given. */
export function candidates(input: string) {
  const cleaned = input.trim().toLowerCase();
  if (cleaned.includes(".")) {
    const domain = normaliseDomain(cleaned);
    return domain ? [domain] : [];
  }
  if (!LABEL.test(cleaned)) return [];
  return POPULAR_TLDS.slice(0, 6).map((tld) => `${cleaned}${tld}`);
}

export type DomainStatus = { domain: string; status: "available" | "registered" | "unknown" };

export async function checkDomain(domain: string): Promise<DomainStatus> {
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404) return { domain, status: "available" };
    if (response.ok) return { domain, status: "registered" };
    return { domain, status: "unknown" };
  } catch {
    return { domain, status: "unknown" };
  }
}
