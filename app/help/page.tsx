import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageFrame } from "@/components/page-frame";
import { ShortcutTable } from "@/components/shortcut-table";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

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
    title: "Assistants",
    body: "The assistant menu in the message box lists Auto and the assistants your plan includes, each with what it is good at. Auto picks one for each message using the optimisation chosen at the top right: Intelligence, Balance (the default) or Cost. Assistants run by an external provider are marked External and are used only once you allow them; allowing them sends the conversation, your custom instructions and your saved memories to that provider.",
  },
  {
    title: "Deep Research and context",
    body: "Turn on Deep Research below the message box to have the assistant search the web, read sources and write a cited report. Next to it, Context shows roughly how much of the assistant's context window the conversation uses; open it for a breakdown. Long chats are summarised automatically so they keep fitting.",
  },
  {
    title: "Your data",
    body: "Export everything you own as JSON from Settings → Data controls. You can delete all chats there, and delete your account from Settings → Account. Administrators cannot read your chats without recording a reason in the audit log.",
  },
];

export default async function HelpPage() {
  const session = await auth();
  if (session?.user) {
    return (
      <AppLayout>
        <PageFrame title="Help">
          <HelpContent />
        </PageFrame>
      </AppLayout>
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Sign in
      </Link>
      <h1 className="mt-6 font-heading text-3xl">Help</h1>
      <div className="mt-8">
        <HelpContent />
      </div>
    </main>
  );
}

function HelpContent() {
  return (
    <>
      <section className="grid gap-4">
        {TOPICS.map((topic) => (
          <article key={topic.title} className="rounded-2xl border bg-card p-5">
            <h2 className="font-medium">{topic.title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{topic.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Keyboard shortcuts</h2>
        <ShortcutTable />
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-5">
        <h2 className="font-medium">Contact</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">For account or access problems, contact your administrator.</p>
      </section>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/legal" className="underline underline-offset-4 hover:text-foreground">
          Legal and acknowledgements
        </Link>
      </p>
    </>
  );
}
