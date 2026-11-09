"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { removeResearchKey, saveResearchConfig, testResearchSources } from "@/app/admin/research-actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PublicResearchConfig } from "@/lib/research/config";

type Status = { id: string; name: string; ok: boolean; error: string | null; ms: number };

function Row({
  title,
  description,
  enabled,
  onEnabled,
  status,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  status?: Status;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4" data-source={title}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {status ? (
            <p className={`mt-1 flex items-center gap-1 text-xs ${status.ok ? "text-primary" : "text-destructive"}`} data-status={status.ok ? "ok" : "failed"}>
              {status.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {status.ok ? `Working · ${status.ms} ms` : status.error}
            </p>
          ) : null}
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={`Use ${title}`} />
      </div>
      {enabled && children ? <div className="grid gap-2 sm:max-w-md">{children}</div> : null}
    </div>
  );
}

export function ResearchForm({ initial }: { initial: PublicResearchConfig }) {
  const [config, setConfig] = useState(initial);
  const [keys, setKeys] = useState({ tavily: "", brave: "" });
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const { report, confirm } = useFeedback();
  const statusOf = (id: string) => statuses.find((status) => status.id === id);

  function save() {
    startSave(async () => {
      const result = await saveResearchConfig({
        wikipedia: config.wikipedia,
        searxng: { enabled: config.searxng.enabled, baseUrl: config.searxng.baseUrl ?? "" },
        tavily: { enabled: config.tavily.enabled, key: keys.tavily || undefined },
        brave: { enabled: config.brave.enabled, key: keys.brave || undefined },
        maxSources: config.maxSources,
        linkReading: config.linkReading,
      });
      if (result.ok) {
        setConfig(result.config);
        setKeys({ tavily: "", brave: "" });
        setStatuses([]);
      }
      report(result, { title: "Research sources saved", description: "Use Test sources to check they respond." });
    });
  }

  async function removeKey(id: "tavily" | "brave") {
    const ok = await confirm({
      title: `Remove the ${id === "tavily" ? "Tavily" : "Brave Search"} key?`,
      description: "The source is turned off until a new key is saved.",
      confirmLabel: "Remove key",
      destructive: true,
    });
    if (!ok) return;
    startSave(async () => {
      const result = await removeResearchKey(id);
      if (result.ok) setConfig(result.config);
      report(result, { title: "Key removed" });
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="divide-y rounded-xl border bg-card">
        <Row
          title="Read links in chat"
          description="When a chat message contains a web address, the server opens the page and gives its text to the model, which cites it. Private and local addresses are never fetched. When off, the assistant says it cannot visit websites."
          enabled={config.linkReading}
          onEnabled={(linkReading) => setConfig({ ...config, linkReading })}
        />
        <Row
          title="Wikipedia"
          description="Free, no key. Encyclopedic topics; not for news or niche subjects."
          enabled={config.wikipedia.enabled}
          onEnabled={(enabled) => setConfig({ ...config, wikipedia: { ...config.wikipedia, enabled } })}
          status={statusOf("wikipedia")}
        >
          <Label htmlFor="wiki-lang">Language code</Label>
          <Input
            id="wiki-lang"
            value={config.wikipedia.language}
            onChange={(event) => setConfig({ ...config, wikipedia: { ...config.wikipedia, language: event.target.value } })}
            className="h-9 w-28"
          />
        </Row>
        <Row
          title="SearXNG"
          description="A self-hosted metasearch engine that queries many web search engines. Its JSON output format must be enabled."
          enabled={config.searxng.enabled}
          onEnabled={(enabled) => setConfig({ ...config, searxng: { ...config.searxng, enabled } })}
          status={statusOf("searxng")}
        >
          <Label htmlFor="searxng-url">Address</Label>
          <Input
            id="searxng-url"
            placeholder="http://127.0.0.1:8888"
            value={config.searxng.baseUrl ?? ""}
            onChange={(event) => setConfig({ ...config, searxng: { ...config.searxng, baseUrl: event.target.value } })}
          />
        </Row>
        {(["tavily", "brave"] as const).map((id) => (
          <Row
            key={id}
            title={id === "tavily" ? "Tavily" : "Brave Search"}
            description={
              id === "tavily"
                ? "Hosted search API built for research. Needs an API key from tavily.com."
                : "Independent web index. Needs a Search API key from brave.com/search/api."
            }
            enabled={config[id].enabled}
            onEnabled={(enabled) => setConfig({ ...config, [id]: { ...config[id], enabled } })}
            status={statusOf(id)}
          >
            <Label htmlFor={`${id}-key`}>API key</Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                placeholder={config[id].keyHint ? `Saved (${config[id].keyHint}). Enter a new key to replace it.` : "Paste the key"}
                value={keys[id]}
                onChange={(event) => setKeys({ ...keys, [id]: event.target.value })}
              />
              {config[id].keyHint ? (
                <Button type="button" variant="outline" onClick={() => void removeKey(id)} disabled={saving}>
                  Remove
                </Button>
              ) : null}
            </div>
          </Row>
        ))}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label htmlFor="max-sources" className="text-sm font-medium">
              Sources per report
            </Label>
            <p className="text-sm text-muted-foreground">How many results are opened and read. More is slower, especially with local models.</p>
          </div>
          <Input
            id="max-sources"
            type="number"
            min={3}
            max={15}
            value={config.maxSources}
            onChange={(event) => setConfig({ ...config, maxSources: Number(event.target.value) })}
            className="h-9 w-28"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing}
          onClick={() =>
            startTest(async () => {
              const result = await testResearchSources();
              if (result.ok) setStatuses(result.statuses);
              report(
                result,
                result.ok
                  ? {
                      title: result.statuses.length ? "Test finished" : "Nothing to test",
                      description: result.statuses.length
                        ? `${result.statuses.filter((status) => status.ok).length} of ${result.statuses.length} saved sources responded.`
                        : "Turn on a source and save it first.",
                    }
                  : undefined,
              );
            })
          }
        >
          {testing ? <Loader2 className="animate-spin" /> : null}
          Test sources
        </Button>
      </div>
    </form>
  );
}
