"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FolderGit2, FolderPlus, Loader2, Trash } from "lucide-react";
import { errorMessage, ideFetch } from "@/components/ide/api";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type Item = { id: string; name: string; folder: string; openedAt: number };

export function WorkspaceList({ workspaces, root }: { workspaces: Item[]; root: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, setPending] = useState(false);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const { workspace } = await ideFetch<{ workspace: { id: string } }>("/api/ide/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), gitUrl: form.get("gitUrl") }),
      });
      router.push(`/ide/${workspace.id}`);
    } catch (error) {
      setPending(false);
      void notify({ tone: "error", title: "Workspace not created", description: errorMessage(error) });
    }
  }

  async function remove(item: Item) {
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      description: "The workspace is removed and its folder is moved to the server's workspace trash, where it can be recovered.",
      confirmLabel: "Delete workspace",
      destructive: true,
    });
    if (!ok) return;
    try {
      await ideFetch(`/api/ide/workspaces/${item.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      void notify({ tone: "error", title: "Delete failed", description: errorMessage(error) });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/chat" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to chat
      </Link>
      <h1 className="font-heading text-3xl">Workspaces</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Projects you open in the IDE. Each one is a folder in <code className="text-xs">{root}</code>.
      </p>

      <form onSubmit={create} className="mt-6 grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="ws-name">Name</Label>
          <Input id="ws-name" name="name" required maxLength={80} placeholder="my-project" className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ws-git">Git repository (optional)</Label>
          <Input id="ws-git" name="gitUrl" type="url" maxLength={500} placeholder="https://github.com/owner/repo.git" className="h-9" />
        </div>
        <Button type="submit" className="h-9" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <FolderPlus />}
          {pending ? "Creating…" : "Create"}
        </Button>
      </form>

      <ul className="mt-6 divide-y rounded-xl border">
        {workspaces.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            No workspaces yet. Create an empty one or clone a repository above.
          </li>
        ) : (
          workspaces.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <FolderGit2 className="size-5 shrink-0 text-muted-foreground" />
              <Link href={`/ide/${item.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium hover:underline">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.folder} · opened {new Date(item.openedAt).toLocaleString()}
                </p>
              </Link>
              <Button asChild size="sm" variant="outline">
                <Link href={`/ide/${item.id}`}>Open</Link>
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${item.name}`}
                onClick={() => void remove(item)}
              >
                <Trash />
              </Button>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
