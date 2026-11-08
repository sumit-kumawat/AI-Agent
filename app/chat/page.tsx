import type { Metadata } from "next";
import { StartChat } from "@/components/chat/start-chat";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatIndexPage({ searchParams }: PageProps<"/chat">) {
  const { temporary } = await searchParams;
  return <StartChat key={temporary === "1" ? "temporary" : "saved"} temporary={temporary === "1"} />;
}
