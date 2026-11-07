import type { Metadata } from "next";
import { StartChat } from "@/components/chat/start-chat";

export const metadata: Metadata = { title: "Chat" };

export default function ChatIndexPage() {
  return <StartChat />;
}
