"use client";

import { useState, useTransition } from "react";
import { saveSystemSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function SettingsForm({
  initial,
}: {
  initial: { chatRateLimitPerMinute: number; registrationEnabled: boolean; moderationKeywords: string[] };
}) {
  const [pending, startTransition] = useTransition();
  const [registration, setRegistration] = useState(initial.registrationEnabled);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="divide-y rounded-xl border bg-card"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setMessage(null);
        startTransition(async () => {
          const result = await saveSystemSettings({
            chatRateLimitPerMinute: Number(form.get("rate")),
            registrationEnabled: registration,
            moderationKeywords: String(form.get("keywords") ?? ""),
          });
          setMessage(
            result.ok
              ? { ok: true, text: `Saved. ${result.keywords} blocked keyword${result.keywords === 1 ? "" : "s"}.` }
              : { ok: false, text: result.error },
          );
        });
      }}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="rate" className="text-sm font-medium">Chat rate limit</Label>
          <p className="text-sm text-muted-foreground">Requests per minute, per user. Applies immediately.</p>
        </div>
        <Input
          id="rate"
          name="rate"
          type="number"
          min={1}
          max={1000}
          required
          defaultValue={initial.chatRateLimitPerMinute}
          className="h-9 w-28"
        />
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Registration</p>
          <p className="text-sm text-muted-foreground">
            When off, only admins can add people. The first account on an empty server is always allowed.
          </p>
        </div>
        <Switch checked={registration} onCheckedChange={setRegistration} aria-label="Allow registration" />
      </div>
      <div className="space-y-2 p-4">
        <Label htmlFor="keywords" className="text-sm font-medium">Content moderation blocklist</Label>
        <p className="text-sm text-muted-foreground">
          One word or phrase per line (or comma-separated). Chat messages containing any of them are rejected.
          Single words match whole words only.
        </p>
        <Textarea
          id="keywords"
          name="keywords"
          rows={6}
          defaultValue={initial.moderationKeywords.join("\n")}
          className="font-mono text-sm"
          placeholder={"example phrase\nanother"}
        />
      </div>
      <div className="flex items-center justify-end gap-3 p-4">
        {message ? (
          <p className={`text-sm ${message.ok ? "text-muted-foreground" : "text-destructive"}`} role="status">
            {message.text}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      </div>
    </form>
  );
}
