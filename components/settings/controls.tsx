"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

export function Row({
  label,
  description,
  children,
  htmlFor,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          data-value={option.value}
          onClick={() => onChange(option.value)}
          className={`h-8 rounded-md px-3 text-sm ${
            option.value === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-9 rounded-lg border bg-background px-2.5 pr-8 text-sm outline-none focus:border-ring"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">{children}</h3>;
}
