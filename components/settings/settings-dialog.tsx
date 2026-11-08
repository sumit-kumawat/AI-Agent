"use client";

import {
  Brain,
  Database,
  Lock,
  Settings,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AccountTab } from "@/components/settings/account-tab";
import { DataTab } from "@/components/settings/data-tab";
import { GeneralTab } from "@/components/settings/general-tab";
import { MemoryTab } from "@/components/settings/memory-tab";
import { PersonalizationTab } from "@/components/settings/personalization-tab";
import { SecurityTab } from "@/components/settings/security-tab";

export const SETTINGS_TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "personalization", label: "Personalization", icon: SlidersHorizontal },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "data", label: "Data controls", icon: Database },
  { id: "security", label: "Security", icon: Lock },
  { id: "account", label: "Account", icon: UserRound },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export function SettingsDialog({
  tab,
  onTabChange,
  onClose,
}: {
  tab: SettingsTab | null;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}) {
  const current = SETTINGS_TABS.find((item) => item.id === tab) ?? SETTINGS_TABS[0];
  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(42rem,calc(100dvh-2rem))] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl md:flex-row"
        data-settings
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Manage your preferences, memory, data and account.</DialogDescription>
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-3"
        >
          <div className="hidden items-center justify-between px-2 pb-3 md:flex">
            <span className="text-sm font-semibold">Settings</span>
          </div>
          {SETTINGS_TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === current.id;
            return (
              <button
                key={item.id}
                type="button"
                data-settings-tab={item.id}
                aria-current={active ? "page" : undefined}
                onClick={() => onTabChange(item.id)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm whitespace-nowrap ${
                  active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-base font-semibold">{current.label}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {current.id === "general" ? <GeneralTab /> : null}
            {current.id === "personalization" ? <PersonalizationTab /> : null}
            {current.id === "memory" ? <MemoryTab /> : null}
            {current.id === "data" ? <DataTab /> : null}
            {current.id === "security" ? <SecurityTab /> : null}
            {current.id === "account" ? <AccountTab /> : null}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}