"use client";

import { useState, useTransition } from "react";
import { savePlanConfig } from "@/app/admin/actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FEATURE_LABEL,
  FEATURES,
  PLAN_IDS,
  WINDOWS,
  type Limits,
  type PlanConfig,
  type PlanId,
} from "@/lib/plans/types";

type ModelChoice = { key: string; name: string; provider: string; local: boolean };

function NumberField({
  label,
  value,
  onChange,
  hint,
  name,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  name: string;
}) {
  const [text, setText] = useState(String(value));
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        name={name}
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value.replace(/[,\s_]/g, ""));
          if (Number.isInteger(parsed) && parsed >= 0) onChange(parsed);
        }}
        className="h-9 tabular-nums"
      />
      <span className="text-xs text-muted-foreground">{hint ?? (value === 0 ? "Unlimited" : value.toLocaleString("en-US"))}</span>
    </label>
  );
}

function LimitsFields({ prefix, limits, onChange }: { prefix: string; limits: Limits; onChange: (limits: Limits) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {WINDOWS.map((window) => (
        <NumberField
          key={window}
          name={`${prefix}.${window}`}
          label={`${window[0]!.toUpperCase()}${window.slice(1)} tokens`}
          value={limits[window]}
          onChange={(value) => onChange({ ...limits, [window]: value })}
        />
      ))}
    </div>
  );
}

export function PlansEditor({ initial, models }: { initial: Record<PlanId, PlanConfig>; models: ModelChoice[] }) {
  const [plans, setPlans] = useState(initial);
  const [tab, setTab] = useState<PlanId>("free");
  const [saving, startSave] = useTransition();
  const { report } = useFeedback();
  const plan = plans[tab];
  const update = (patch: Partial<PlanConfig>) => setPlans((current) => ({ ...current, [tab]: { ...current[tab], ...patch } }));

  function save() {
    startSave(async () => {
      const payload = Object.fromEntries(PLAN_IDS.map((id) => [id, { ...plans[id], id: undefined }]));
      report(await savePlanConfig(payload), { title: "Plans saved" });
    });
  }

  return (
    <div className="space-y-4" data-plans-editor>
      <div className="flex gap-1 rounded-lg border p-1" role="tablist">
        {PLAN_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-plan-tab={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
          >
            {plans[id].name}
          </button>
        ))}
      </div>

      <section key={tab} className="space-y-6 rounded-xl border p-4" data-plan-form={tab}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={plan.name} maxLength={40} onChange={(event) => update({ name: event.target.value })} className="h-9" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-tagline">Description</Label>
            <Input id="plan-tagline" value={plan.tagline} maxLength={160} onChange={(event) => update({ tagline: event.target.value })} className="h-9" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Price</p>
              <p className="text-sm text-muted-foreground">Shown on the plans page. Leave off until you have set real pricing.</p>
            </div>
            <Switch
              checked={plan.price !== null}
              aria-label="Show a price"
              onCheckedChange={(on) => update({ price: on ? { amount: 0, currency: "INR", interval: "month" } : null })}
            />
          </div>
          {plan.price ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                name="price.amount"
                label="Amount"
                value={plan.price.amount}
                hint=" "
                onChange={(amount) => update({ price: { ...plan.price!, amount } })}
              />
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Currency</span>
                <Input
                  value={plan.price.currency}
                  maxLength={3}
                  onChange={(event) => update({ price: { ...plan.price!, currency: event.target.value.toUpperCase() } })}
                  className="h-9"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Billed</span>
                <select
                  value={plan.price.interval}
                  onChange={(event) => update({ price: { ...plan.price!, interval: event.target.value as "month" | "year" } })}
                  className="h-9 rounded-md border bg-background px-2"
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Token allowance</p>
          <LimitsFields prefix="limits" limits={plan.limits} onChange={(limits) => update({ limits })} />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Monthly allowance resets on the day the plan started
              <span className="block text-muted-foreground">Off: resets on the 1st of each month.</span>
            </span>
            <Switch
              checked={plan.period === "subscription"}
              onCheckedChange={(on) => update({ period: on ? "subscription" : "calendar" })}
              aria-label="Subscription billing period"
            />
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Feature limits</p>
          {FEATURES.map((feature) => (
            <div key={feature} className="space-y-1">
              <p className="text-sm text-muted-foreground">{FEATURE_LABEL[feature]}</p>
              <LimitsFields
                prefix={`featureLimits.${feature}`}
                limits={plan.featureLimits[feature]}
                onChange={(limits) => update({ featureLimits: { ...plan.featureLimits, [feature]: limits } })}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Features</p>
          {(
            [
              ["attachments", "File attachments"],
              ["research", "Deep Research"],
              ["ide", "IDE"],
              ["cloudModels", "Cloud models"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {label}
              <Switch
                checked={plan.features[key]}
                aria-label={label}
                data-feature={key}
                onCheckedChange={(on) => update({ features: { ...plan.features, [key]: on } })}
              />
            </label>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              name="storage.attachments"
              label="Attachment storage (MB)"
              value={plan.storageMb.attachments}
              onChange={(attachments) => update({ storageMb: { ...plan.storageMb, attachments } })}
            />
            <NumberField
              name="storage.ide"
              label="IDE workspace storage (MB)"
              value={plan.storageMb.ide}
              onChange={(ide) => update({ storageMb: { ...plan.storageMb, ide } })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Models</p>
              <p className="text-sm text-muted-foreground">
                Accounts on this plan only see and use these. Models stay installed either way.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              Every model, including future ones
              <Switch checked={plan.allModels} onCheckedChange={(allModels) => update({ allModels })} aria-label="Every model" />
            </label>
          </div>
          {plan.allModels ? null : (
            <ul className="grid gap-1 sm:grid-cols-2" data-plan-models>
              {models.map((model) => {
                const checked = plan.models.includes(model.key);
                const limits = plan.modelLimits[model.key];
                return (
                  <li key={model.key} className="rounded-md border px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        data-model-key={model.name}
                        onChange={(event) =>
                          update({
                            models: event.target.checked
                              ? [...plan.models, model.key]
                              : plan.models.filter((key) => key !== model.key),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.provider}</span>
                    </label>
                    {checked ? (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {limits ? "Model limit set" : "Add a limit for this model"}
                        </summary>
                        <div className="mt-2">
                          <LimitsFields
                            prefix={`model.${model.key}`}
                            limits={limits ?? { daily: 0, weekly: 0, monthly: 0 }}
                            onChange={(next) => {
                              const rest = { ...plan.modelLimits };
                              if (WINDOWS.every((window) => next[window] === 0)) delete rest[model.key];
                              else rest[model.key] = next;
                              update({ modelLimits: rest });
                            }}
                          />
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {plan.models.some((key) => !models.some((model) => model.key === key)) && !plan.allModels ? (
            <p className="text-xs text-muted-foreground">
              Also includes {plan.models.filter((key) => !models.some((model) => model.key === key)).length} model(s) that are
              not installed or enabled right now; they become available if installed.
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving} data-save-plans>
          {saving ? "Saving…" : "Save plans"}
        </Button>
      </div>
    </div>
  );
}
