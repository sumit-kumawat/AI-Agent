"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="font-heading text-3xl">This chat could not load</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your saved messages are still in the database. Reload the chat or start
        a new one.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={reset}>
          Reload
        </Button>
        <Button asChild variant="outline">
          <Link href="/chat">All chats</Link>
        </Button>
      </div>
    </div>
  );
}
