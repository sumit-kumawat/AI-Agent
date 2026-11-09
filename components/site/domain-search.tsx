"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { domain: string; status: "available" | "registered" | "unknown" };

const LABEL: Record<Result["status"], string> = {
  available: "Available",
  registered: "Registered",
  unknown: "Could not check",
};

export function DomainSearch({ action }: { action: "register" | "transfer" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/domains/check?q=${encodeURIComponent(query.trim())}`);
      const body = (await response.json()) as { results?: Result[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      setResults(body.results ?? []);
    } catch (caught) {
      setResults(null);
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setPending(false);
    }
  }

  const requestHref = (domain: string) =>
    `/portal/projects/new?type=domain&title=${encodeURIComponent(`${action === "transfer" ? "Transfer" : "Register"} ${domain}`)}`;

  return (
    <div className="max-w-2xl">
      <form onSubmit={search} className="flex gap-2" role="search">
        <label htmlFor="domain-query" className="sr-only">
          Domain name
        </label>
        <Input
          id="domain-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={action === "transfer" ? "yourdomain.com" : "Find your domain, e.g. mybusiness"}
          className="h-12 rounded-full bg-background px-5 text-base"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button type="submit" disabled={pending} className="h-12 rounded-full px-6">
          <Search aria-hidden />
          {pending ? "Checking…" : action === "transfer" ? "Check" : "Search"}
        </Button>
      </form>
      <div aria-live="polite">
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {results ? (
          <ul className="mt-4 divide-y rounded-2xl border bg-card" data-domain-results>
            {results.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">Enter a name like mybusiness or mybusiness.in.</li>
            ) : (
              results.map((result) => (
                <li key={result.domain} className="flex flex-wrap items-center justify-between gap-3 p-4" data-status={result.status}>
                  <span className="font-medium">{result.domain}</span>
                  <span className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        result.status === "available"
                          ? "text-primary"
                          : result.status === "registered"
                            ? "text-muted-foreground"
                            : "text-amber-700 dark:text-amber-300"
                      }
                    >
                      {LABEL[result.status]}
                    </span>
                    {(action === "register" && result.status === "available") ||
                    (action === "transfer" && result.status === "registered") ? (
                      <Button asChild size="sm" className="rounded-full">
                        <Link href={requestHref(result.domain)}>
                          {action === "transfer" ? "Request transfer" : "Request registration"}
                        </Link>
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Availability comes from each registry&rsquo;s RDAP service. Online registration needs a registrar account, which
          is not connected yet, so our team completes registrations and transfers and invoices you in the portal.
        </p>
      </div>
    </div>
  );
}
