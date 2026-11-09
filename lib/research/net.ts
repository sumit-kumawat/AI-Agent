import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// Wikimedia asks API clients to identify themselves with a way to reach the operator.
export const USER_AGENT = "ConzexResearch/1.0 (https://github.com/sumit-kumawat/AI-Agent; self-hosted research assistant)";

/** Loopback, private, link-local, carrier-grade NAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
}

/** Refuses private addresses at connect time, so DNS answers cannot be swapped between check and use. */
const publicAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error, "", 4);
        const list = addresses as dns.LookupAddress[];
        const safe = list.filter((entry) => !isPrivateAddress(entry.address));
        if (safe.length === 0 || safe.length !== list.length) {
          return callback(Object.assign(new Error(`Blocked address for ${hostname}`), { code: "EBLOCKED" }), "", 4);
        }
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, safe);
        callback(null, safe[0]!.address, safe[0]!.family);
      });
    },
  },
  headersTimeout: 10_000,
  bodyTimeout: 15_000,
});

const trustedAgent = new Agent({ headersTimeout: 15_000, bodyTimeout: 20_000 });

export class FetchFailed extends Error {}

type Options = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Admin-configured endpoints (e.g. a SearXNG on this machine) may be private. */
  trusted?: boolean;
  signal?: AbortSignal;
};

/**
 * Fetches a public http(s) URL, following up to three redirects and
 * re-checking each hop. The body is capped at `maxBytes`.
 */
export async function safeFetch(url: string, options: Options = {}) {
  let current = new URL(url);
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 12_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  for (let hop = 0; hop < 4; hop += 1) {
    if (current.protocol !== "https:" && current.protocol !== "http:") throw new FetchFailed("Only web links can be read.");
    if (current.username || current.password) throw new FetchFailed("Links with credentials are not followed.");
    if (!options.trusted && net.isIP(current.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(current.hostname.replace(/^\[|\]$/g, ""))) {
      throw new FetchFailed("Private addresses are not fetched.");
    }
    let response;
    try {
      response = await undiciFetch(current, {
        method: options.method ?? "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5", ...options.headers },
        body: options.body,
        redirect: "manual",
        signal,
        dispatcher: options.trusted ? trustedAgent : publicAgent,
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === "EBLOCKED") throw new FetchFailed("Private addresses are not fetched.");
      if (signal.aborted) throw new FetchFailed("Timed out.");
      throw new FetchFailed("Could not connect.");
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      await response.body?.cancel();
      current = new URL(response.headers.get("location")!, current);
      continue;
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new FetchFailed("Page is too large.");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > maxBytes) break;
        chunks.push(chunk);
      }
    }
    return {
      url: current.toString(),
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") ?? "",
      body: Buffer.concat(chunks),
    };
  }
  throw new FetchFailed("Too many redirects.");
}

export async function fetchJson<T>(url: string, options: Options = {}): Promise<T> {
  const response = await safeFetch(url, { ...options, headers: { Accept: "application/json", ...options.headers } });
  if (!response.ok) throw new FetchFailed(`HTTP ${response.status}`);
  try {
    return JSON.parse(response.body.toString("utf8")) as T;
  } catch {
    throw new FetchFailed("The response was not JSON.");
  }
}
