import type { Metadata } from "next";
import { HomePage } from "@/components/landing/home";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Harbor",
  description:
    "A self-hosted agent platform. Chat with a local model and keep the conversation history on your machine.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  return <HomePage signedIn={Boolean(session?.user?.id)} />;
}
