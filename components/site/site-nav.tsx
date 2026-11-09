"use client";

import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type NavMenu = { label: string; items: { href: string; title: string; summary: string }[] };

export function SiteNav({ menus, signedIn }: { menus: NavMenu[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="mr-4 flex items-center gap-2 text-base font-semibold">
          <Mark className="size-7 text-brand" />
          CONZEX
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {menus.map((menu) => (
            <DropdownMenu key={menu.label} modal={false}>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground">
                {menu.label}
                <ChevronDown className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80 p-2">
                {menu.items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild className="items-start rounded-lg px-3 py-2">
                    <Link href={item.href} className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.summary}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <Link href="/ai" className="rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            CONZEX AI
          </Link>
          <Link href="/support" className="rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            Support
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <>
              <Button asChild variant="ghost" className="hidden rounded-full sm:inline-flex">
                <Link href="/portal">Portal</Link>
              </Button>
              <Button asChild className="rounded-full">
                <Link href="/chat">Open CONZEX AI</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="rounded-full">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild className="hidden rounded-full sm:inline-flex">
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-5 px-4 pb-8">
                {menus.map((menu) => (
                  <div key={menu.label}>
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{menu.label}</p>
                    {menu.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-lg px-2 py-2 text-sm hover:bg-muted"
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                ))}
                <div className="flex flex-col">
                  {[
                    ["/ai", "CONZEX AI"],
                    ["/support", "Support"],
                    ["/faq", "FAQs"],
                    ["/about", "About"],
                    ...(signedIn ? [["/portal", "Portal"]] : [["/register", "Get started"]]),
                  ].map(([href, label]) => (
                    <Link
                      key={href}
                      href={href!}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-2 py-2 text-sm hover:bg-muted"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
