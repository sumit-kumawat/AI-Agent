"use client";

import type { ReactNode } from "react";
import { ChatTopBar } from "@/components/chat/chat-shell";

/** A scrolling content page inside the app shell, under the shared top bar. */
export function PageFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <ChatTopBar title={title} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pt-2 pb-12 sm:px-6">
          <h1 className="font-heading text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
