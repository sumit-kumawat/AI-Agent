import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentAccessForm } from "@/components/admin/content-access-form";
import { MessageActions } from "@/components/admin/message-actions";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { ACCESS_WINDOW_MS, activeContentGrant } from "@/lib/content-access";
import { conversationForAudit } from "@/lib/db/admin-queries";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Conversation" };

export default async function AdminConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  const record = conversationForAudit(id);
  if (!record) notFound();
  const { conversation, messages } = record;
  const grant = activeContentGrant(admin.id, conversation.id);
  const reason = grant?.details ? (JSON.parse(grant.details) as { reason?: string }).reason : undefined;

  return (
    <>
      <Link href="/admin/conversations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        All conversations
      </Link>
      <PageHeader
        title={conversation.title}
        description={`${conversation.email} · ${conversation.model ?? "default model"} · ${messages.length} messages · started ${formatDateTime(conversation.createdAt)}`}
      />
      {!grant ? (
        <ContentAccessForm conversationId={conversation.id} />
      ) : (
        <>
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm" data-access-granted>
            Access recorded at {formatDateTime(grant.createdAt)} (reason: &ldquo;{reason}&rdquo;). It expires at{" "}
            {formatDateTime(grant.createdAt + ACCESS_WINDOW_MS)}.
          </p>
          {messages.length === 0 ? (
            <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              This conversation has no messages.
            </p>
          ) : (
            <ol className="space-y-3">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={`rounded-xl border bg-card p-4 ${message.flagged ? "border-destructive/50 bg-destructive/5" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={message.role === "user" ? "default" : "secondary"}>{message.role}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
                    {message.flagged ? (
                      <span className="text-xs text-destructive">
                        Flagged by {message.flaggedBy}
                        {message.flagReason ? `: ${message.flagReason}` : ""}
                      </span>
                    ) : null}
                    <div className="ml-auto">
                      <MessageActions id={message.id} flagged={Boolean(message.flagged)} />
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
