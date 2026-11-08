import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Mark } from "@/components/brand";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Help" };

const SHORTCUTS = [
  ["⌘/Ctrl + K", "Search chats"],
  ["⌘/Ctrl + Shift + O", "New chat"],
  ["⌘/Ctrl + ,", "Open settings"],
  ["Enter", "Send (configurable in Settings → General)"],
  ["Shift + Enter", "New line"],
  ["Esc", "Close a dialog or cancel an edit"],
];

const TOPICS = [
  {
    title: "Chats",
    body: "Start a chat from New chat. Chats are saved automatically and named from your first message. Use the ⋯ menu next to a chat to pin, rename, archive or delete it. Archived chats are under Settings → Data controls.",
  },
  {
    title: "Editing and regenerating",
    body: "Hover one of your messages and choose Edit to change it; the conversation continues from the edited message. Use Regenerate under the latest reply for a new answer, and Continue when a reply was cut off or stopped.",
  },
  {
    title: "Temporary chats",
    body: "Turn on Temporary on the new-chat screen. Temporary chats are not shown in history or search, never read or update memory, and are deleted after 24 hours.",
  },
  {
    title: "Memory",
    body: "Say “Remember that …” in a chat to save a fact. A “Memory updated” note appears under the reply. Review, edit or delete memories in Settings → Memory, or turn memory off entirely. Nothing is saved without an explicit request.",
  },
  {
    title: "Personalization",
    body: "In Settings → Personalization, tell the assistant what to call you, what you do, and how to respond, and pick a personality and answer length. These apply to every new reply while custom instructions are on.",
  },
  {
    title: "Your data",
    body: "Export everything you own as JSON from Settings → Data controls. You can delete all chats there, and delete your account from Settings → Account. Administrators cannot read your chats without recording a reason in the audit log.",
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <Link href="/chat" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to chat
      </Link>
      <div className="mt-6 flex items-center gap-3">
        <Mark className="size-9 text-primary" />
        <h1 className="font-heading text-3xl">Help &amp; support</h1>
      </div>
      <p className="mt-2 text-muted-foreground">How to get the most out of {BRAND.product}.</p>

      <section className="mt-8 grid gap-4">
        {TOPICS.map((topic) => (
          <article key={topic.title} className="rounded-2xl border bg-card p-5">
            <h2 className="font-medium">{topic.title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{topic.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Keyboard shortcuts</h2>
        <dl className="mt-3 divide-y rounded-2xl border">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{action}</dt>
              <dd>
                <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-5">
        <h2 className="font-medium">Contact</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {BRAND.product} is a product of {BRAND.company}. For account or access problems, contact your administrator,
          or reach {BRAND.company} at{" "}
          <a href={BRAND.companyUrl} className="text-primary underline" target="_blank" rel="noreferrer">
            {BRAND.companyUrl.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
