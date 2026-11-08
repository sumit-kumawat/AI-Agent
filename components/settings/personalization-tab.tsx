"use client";

import { useState } from "react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Row, Select, Toggle } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRAND } from "@/lib/brand";
import { PERSONALITIES, PERSONALITY_LABELS } from "@/lib/preferences-schema";

const PERSONALITY_HELP: Record<(typeof PERSONALITIES)[number], string> = {
  default: "Balanced and direct.",
  concise: "Short answers without filler.",
  friendly: "Warm and encouraging.",
  professional: "Polished, work-ready tone.",
  candid: "Direct, will push back.",
  teacher: "Step-by-step explanations.",
};

export function PersonalizationTab() {
  const { prefs, updatePrefs } = useChatChrome();
  const [draft, setDraft] = useState({
    nickname: prefs.nickname,
    occupation: prefs.occupation,
    aboutMe: prefs.aboutMe,
    instructions: prefs.instructions,
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    draft.nickname !== prefs.nickname ||
    draft.occupation !== prefs.occupation ||
    draft.aboutMe !== prefs.aboutMe ||
    draft.instructions !== prefs.instructions;

  async function save() {
    setSaving(true);
    await updatePrefs(draft, "Custom instructions saved");
    setSaving(false);
  }

  return (
    <div>
      <Row
        label="Use custom instructions"
        description="When off, the details below are kept but not sent to the model."
        htmlFor="settings-custom"
      >
        <Toggle
          id="settings-custom"
          label="Use custom instructions"
          checked={prefs.customInstructionsEnabled}
          onChange={(customInstructionsEnabled) => void updatePrefs({ customInstructionsEnabled })}
        />
      </Row>
      <Row label="Personality" description={PERSONALITY_HELP[prefs.personality]} htmlFor="settings-personality">
        <Select
          id="settings-personality"
          value={prefs.personality}
          onChange={(personality) => void updatePrefs({ personality })}
          options={PERSONALITIES.map((value) => ({ value, label: PERSONALITY_LABELS[value] }))}
        />
      </Row>
      <Row label="Response length" htmlFor="settings-length">
        <Select
          id="settings-length"
          value={prefs.responseLength}
          onChange={(responseLength) => void updatePrefs({ responseLength })}
          options={[
            { value: "auto", label: "Automatic" },
            { value: "short", label: "Shorter" },
            { value: "detailed", label: "More detailed" },
          ]}
        />
      </Row>

      <form
        className="mt-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">What should {BRAND.product} call you?</span>
            <Input
              name="nickname"
              value={draft.nickname}
              maxLength={60}
              placeholder="Nickname"
              onChange={(event) => setDraft({ ...draft, nickname: event.target.value })}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">What do you do?</span>
            <Input
              name="occupation"
              value={draft.occupation}
              maxLength={120}
              placeholder="e.g. Backend engineer"
              onChange={(event) => setDraft({ ...draft, occupation: event.target.value })}
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Anything else it should know about you?</span>
          <Textarea
            name="aboutMe"
            value={draft.aboutMe}
            maxLength={1500}
            rows={3}
            placeholder="Interests, values, context you want it to keep in mind"
            onChange={(event) => setDraft({ ...draft, aboutMe: event.target.value })}
          />
          <span className="text-right text-xs text-muted-foreground">{draft.aboutMe.length}/1500</span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">How should it respond?</span>
          <Textarea
            name="instructions"
            value={draft.instructions}
            maxLength={1500}
            rows={4}
            placeholder="e.g. Use British spelling. Show code in TypeScript. Ask before making assumptions."
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
          />
          <span className="text-right text-xs text-muted-foreground">{draft.instructions.length}/1500</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() =>
              setDraft({
                nickname: prefs.nickname,
                occupation: prefs.occupation,
                aboutMe: prefs.aboutMe,
                instructions: prefs.instructions,
              })
            }
          >
            Reset
          </Button>
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
