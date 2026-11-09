"use client";

import { Check } from "lucide-react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Row, Segmented, Select, Toggle } from "@/components/settings/controls";
import { ACCENTS, type Preferences } from "@/lib/preferences-schema";
import { useShortcut } from "@/lib/shortcuts";

const SWATCH: Record<Preferences["accent"], string> = {
  teal: "#10a37f",
  blue: "oklch(0.55 0.15 255)",
  violet: "oklch(0.55 0.17 295)",
  rose: "oklch(0.6 0.17 10)",
  amber: "oklch(0.7 0.14 70)",
  slate: "oklch(0.4 0.02 250)",
};

const LANGUAGES = [
  "",
  "English",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Arabic",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Russian",
  "Turkish",
  "Indonesian",
] as const;

export function GeneralTab() {
  const { prefs, updatePrefs } = useChatChrome();
  const sendKey = useShortcut("mod+enter");
  return (
    <div>
      <Row label="Theme" description="System follows your device setting.">
        <Segmented
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => void updatePrefs({ theme })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Row>
      <Row label="Accent colour">
        <div role="radiogroup" aria-label="Accent colour" className="flex gap-2">
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={prefs.accent === accent}
              aria-label={accent}
              title={accent.charAt(0).toUpperCase() + accent.slice(1)}
              data-accent-option={accent}
              onClick={() => void updatePrefs({ accent })}
              className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring aria-checked:ring-2 aria-checked:ring-foreground/40"
              style={{ backgroundColor: SWATCH[accent] }}
            >
              {prefs.accent === accent ? <Check className="size-4 text-white" /> : null}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Text size">
        <Segmented
          label="Text size"
          value={prefs.fontSize}
          onChange={(fontSize) => void updatePrefs({ fontSize })}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Default" },
            { value: "large", label: "Large" },
          ]}
        />
      </Row>
      <Row label="Density" description="Compact puts more messages on screen.">
        <Segmented
          label="Density"
          value={prefs.density}
          onChange={(density) => void updatePrefs({ density })}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </Row>
      <Row label="Response language" description="Auto replies in the language you write in." htmlFor="settings-language">
        <Select
          id="settings-language"
          value={(LANGUAGES as readonly string[]).includes(prefs.language) ? prefs.language : ""}
          onChange={(language) => void updatePrefs({ language })}
          options={LANGUAGES.map((language) => ({ value: language, label: language || "Auto-detect" }))}
        />
      </Row>
      <Row
        label="Allow cloud models"
        description="Off by default. Turning it on lets a chat send your messages, custom instructions and saved memories to a provider an admin has connected, such as OpenAI."
        htmlFor="settings-cloud"
      >
        <Toggle
          id="settings-cloud"
          label="Allow cloud models"
          checked={prefs.cloudModels}
          onChange={(cloudModels) => void updatePrefs({ cloudModels })}
        />
      </Row>
      <Row
        label="Enter sends the message"
        description={`When off, Enter adds a new line and ${sendKey} sends.`}
        htmlFor="settings-enter"
      >
        <Toggle
          id="settings-enter"
          label="Enter sends the message"
          checked={prefs.sendWithEnter}
          onChange={(sendWithEnter) => void updatePrefs({ sendWithEnter })}
        />
      </Row>
    </div>
  );
}
