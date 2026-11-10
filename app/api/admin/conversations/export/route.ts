import { z } from "zod";
import { adminAction } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/api";
import { exportConversations } from "@/lib/admin/conversations";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(500),
});

/**
 * Exports conversations as JSON, including message text. Like reading a chat,
 * this needs a written reason, recorded in the audit log for each conversation.
 */
export async function POST(request: Request) {
  let admin;
  try {
    assertSameOrigin(request);
    admin = await adminAction();
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Select conversations and give a reason." }, { status: 400 });
  }
  const data = exportConversations(parsed.data.ids);
  for (const conversation of data) {
    audit(admin, "conversation.export", { type: "conversation", id: conversation.id }, {
      owner: conversation.owner.id,
      reason: parsed.data.reason,
      messages: conversation.messages.length,
    });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), exportedBy: admin.email, reason: parsed.data.reason, conversations: data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversations-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
