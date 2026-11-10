import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { licensesFor } from "@/lib/models/licenses";
import { getInventory } from "@/lib/ollama";

export const metadata: Metadata = { title: "Legal and acknowledgements" };
export const dynamic = "force-dynamic";

const SOFTWARE = [
  { name: "Next.js and React", license: "MIT License", url: "https://github.com/vercel/next.js/blob/canary/license.md" },
  { name: "AI SDK", license: "Apache License 2.0", url: "https://github.com/vercel/ai/blob/main/LICENSE" },
  { name: "Monaco Editor", license: "MIT License", url: "https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt" },
  { name: "Lucide icons", license: "ISC License", url: "https://lucide.dev/license" },
  { name: "SQLite", license: "Public domain", url: "https://sqlite.org/copyright.html" },
];

export default async function LegalPage() {
  const inventory = await getInventory();
  const licenses = inventory.ok ? licensesFor(inventory.models.map((model) => model.name)) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <Link href="/chat" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to {BRAND.product}
      </Link>
      <h1 className="mt-6 font-heading text-3xl">Legal and acknowledgements</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BRAND.product} assistants are built on AI models and software from other developers, used under the licences below.
      </p>

      <section className="mt-8" data-model-licenses>
        <h2 className="font-medium">AI models</h2>
        {licenses === null ? (
          <p className="mt-2 text-sm text-muted-foreground">The list of models in use is not available right now.</p>
        ) : licenses.known.length === 0 && licenses.unknown.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No models are in use.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {licenses.known.map((entry) => (
              <li key={entry.family} className="rounded-2xl border bg-card p-4 text-sm" data-license={entry.family}>
                <p className="font-medium">{entry.family}</p>
                <p className="mt-1 text-muted-foreground">
                  <a href={entry.url} className="underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
                    {entry.license}
                  </a>
                </p>
                {entry.notice ? <p className="mt-2 text-muted-foreground">{entry.notice}</p> : null}
              </li>
            ))}
            {licenses.unknown.length ? (
              <li className="rounded-2xl border bg-card p-4 text-sm">
                <p className="font-medium">Other models</p>
                <p className="mt-1 text-muted-foreground">
                  {licenses.unknown.join(", ")}: used under the licence published by each model&apos;s developer.
                </p>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Software</h2>
        <ul className="mt-3 divide-y rounded-2xl border bg-card text-sm">
          {SOFTWARE.map((entry) => (
            <li key={entry.name} className="flex flex-wrap justify-between gap-2 px-4 py-3">
              <span>{entry.name}</span>
              <a href={entry.url} className="text-muted-foreground underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
                {entry.license}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
