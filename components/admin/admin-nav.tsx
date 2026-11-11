"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Boxes,
  Cloud,
  LayoutDashboard,
  MessagesSquare,
  Plug,
  Settings,
  Sparkles,
  Telescope,
  Users,
  type LucideIcon,
} from "lucide-react";

export const ADMIN_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/admin/usage", label: "Usage", icon: Activity },
  { href: "/admin/plans", label: "Plans", icon: Sparkles },
  { href: "/admin/models", label: "Models", icon: Boxes },
  { href: "/admin/agents", label: "Agents & routing", icon: Bot },
  { href: "/admin/providers", label: "Providers", icon: Cloud },
  { href: "/admin/research", label: "Research", icon: Telescope },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function adminSection(pathname: string) {
  return [...ADMIN_LINKS].reverse().find((link) => (link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href)));
}

/** The admin sections, shown in the app sidebar while an admin page is open. */
export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = adminSection(pathname);
  return (
    <nav aria-label="Admin sections" className="space-y-0.5" data-admin-nav>
      <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">Admin</p>
      {ADMIN_LINKS.map(({ href, label, icon: Icon }) => {
        const active = current?.href === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm ${
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
