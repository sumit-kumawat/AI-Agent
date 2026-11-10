"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { saveModelBranding } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedback } from "@/components/feedback";

export type AssistantRow = {
  key: string;
  modelId: string;
  providerName: string;
  defaultName: string;
  name: string;
  description: string;
  override: { displayName: string | null; description: string | null };
  capabilities: string[];
};

function Row({ row }: { row: AssistantRow }) {
  const router = useRouter();
  const { toast, report } = useFeedback();
  const [name, setName] = useState(row.override.displayName ?? "");
  const [description, setDescription] = useState(row.override.description ?? "");
  const [pending, start] = useTransition();
  const dirty = name !== (row.override.displayName ?? "") || description !== (row.override.description ?? "");
  const overridden = Boolean(row.override.displayName || row.override.description);

  function save(next: { displayName: string; description: string }) {
    start(async () => {
      const result = await saveModelBranding({ key: row.key, ...next });
      if (!report(result)) return;
      setName(next.displayName);
      setDescription(next.description);
      if (result.ok) toast(`Saved as ${result.name}`);
      router.refresh();
    });
  }

  return (
    <TableRow data-assistant-row={row.modelId}>
      <TableCell className="pl-4 align-top">
        <p className="font-mono text-xs">{row.modelId}</p>
        <p className="text-xs text-muted-foreground">{row.providerName}</p>
      </TableCell>
      <TableCell className="align-top">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={row.defaultName}
          maxLength={40}
          aria-label={`Customer name for ${row.modelId}`}
          className="h-8"
          data-assistant-name-input
        />
      </TableCell>
      <TableCell className="align-top">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={row.override.description ? "" : row.description}
          maxLength={160}
          aria-label={`Customer description for ${row.modelId}`}
          className="h-8"
        />
        <p className="mt-1 text-xs text-muted-foreground">{row.capabilities.join(" · ")}</p>
      </TableCell>
      <TableCell className="pr-4 align-top">
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-8"
                disabled={!dirty || pending}
                onClick={() => save({ displayName: name.trim(), description: description.trim() })}
                aria-label="Save"
                data-assistant-save
              >
                <Check />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={!overridden || pending}
                onClick={() => save({ displayName: "", description: "" })}
                aria-label="Use the generated name"
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Use the generated name</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function AssistantNamesTable({ rows }: { rows: AssistantRow[] }) {
  return (
    <Table className="min-w-[48rem]" data-assistant-names>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Model ID</TableHead>
          <TableHead className="w-56">Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="pr-4 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}
