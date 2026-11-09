"use client";

import { Bot, FolderKanban, LayoutDashboard, ReceiptText, Server, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/services", label: "Services", icon: Server },
  { href: "/portal/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/portal/projects", label: "Requests", icon: FolderKanban },
  { href: "/portal/billing", label: "Billing details", icon: UserRound },
  { href: "/chat", label: "CONZEX AI", icon: Bot },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/portal" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
