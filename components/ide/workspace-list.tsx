"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FolderGit2, FolderPlus, HardDrive, Loader2, Terminal, Trash } from "lucide-react";
import { ChatTopBar } from "@/components/chat/chat-shell";
import { errorMessage, ideFetch } from "@/components/ide/api";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Item = { id: string; name: string; folder: string; openedAt: number };

export type IdeStorage = { used: number; limit: number | null };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
  return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10} GB`;
}

export function WorkspaceList({
  workspaces,
  root,
  admin,
  storage,
}: {
  workspaces: Item[];
  /** The server folder; only sent to admins. */
  root: string | null;
  admin: boolean;
  storage: IdeStorage;
}) {
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
      description: admin
        ? "The workspace is removed and its folder is moved to the server's workspace trash, where it can be recovered."
        : "The workspace and all of its files are deleted permanently. This cannot be undone.",
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

  const share = storage.limit ? Math.min(1, storage.used / storage.limit) : 0;

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar title="IDE" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 pt-2 pb-12 sm:px-6">
          <h1 className="font-heading text-3xl">Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {root ? (
              <>
                Projects you open in the IDE. Each one is a folder in <code className="text-xs">{root}</code>.
              </>
            ) : (
              "Your projects. Only you can see and open them."
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" data-ide-storage={storage.used} data-ide-storage-limit={storage.limit ?? ""}>
            <span className="flex min-w-56 flex-1 items-center gap-2">
              <HardDrive className="size-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0">
                {formatBytes(storage.used)} used
                {storage.limit ? ` of ${formatBytes(storage.limit)}` : " · no storage limit"}
              </span>
              {storage.limit ? (
                <span className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className={`block h-full rounded-full ${share >= 0.9 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </span>
              ) : null}
            </span>
            {!admin ? (
              <span className="flex items-center gap-2 text-muted-foreground" data-ide-terminal-note>
                <Terminal className="size-4 shrink-0" />
                The terminal is limited to admins because it runs commands on the server.
              </span>
            ) : null}
          </div>

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
                <li key={item.id} className="flex items-center gap-3 p-3" data-workspace={item.id}>
                  <FolderGit2 className="size-5 shrink-0 text-muted-foreground" />
                  <Link href={`/ide/${item.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium hover:underline">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {admin ? `${item.folder} · ` : ""}opened {new Date(item.openedAt).toLocaleString()}
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
                    title={`Delete ${item.name}`}
                    onClick={() => void remove(item)}
                  >
                    <Trash />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
