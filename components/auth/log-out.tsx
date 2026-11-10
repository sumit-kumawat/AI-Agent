"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Asks first, then ends the session. Chats and settings stay on the account. */
export function useLogOut() {
  const { confirm } = useFeedback();
  return async () => {
    const ok = await confirm({
      title: "Log out?",
      description: "Your chats and settings stay saved to your account.",
      confirmLabel: "Log out",
    });
    if (!ok) return;
    await signOut({ callbackUrl: "/login" });
  };
}

export function LogOutButton({ className }: { className?: string }) {
  const logOut = useLogOut();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={className}
          aria-label="Log out"
          data-log-out
          onClick={() => void logOut()}
        >
          <LogOut />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">Log out</TooltipContent>
    </Tooltip>
  );
}
