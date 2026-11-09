"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { KeyRound, Shield } from "lucide-react";
import { adminSection } from "@/components/admin/admin-nav";
import { ChatTopBar } from "@/components/chat/chat-shell";
import { Button } from "@/components/ui/button";

/** Admin pages inside the app shell: the shared header, then one scrolling content column. */
export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = adminSection(pathname);
  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title={
          <p className="flex items-center gap-1.5 truncate text-sm font-medium" data-admin-title>
            <Shield className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Admin</span>
            {section && section.href !== "/admin" ? (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="truncate">{section.label}</span>
              </>
            ) : null}
          </p>
        }
        actions={
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/account/password?next=/admin" title="Change password">
              <KeyRound />
              <span className="hidden sm:inline">Change password</span>
            </Link>
          </Button>
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pt-2 pb-12 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
