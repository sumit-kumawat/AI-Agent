import Link from "next/link";
import { AgentRow, KillButton, LiveRefresh, ModelToggle } from "@/components/admin/agent-controls";
import { Empty, PageHeader, Section, TableCard } from "@/components/admin/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONNECTED_AGENTS, listAgents, listSessions } from "@/lib/agents";
import { disabledModelNames } from "@/lib/db/queries";
import { formatAgo, formatBytes } from "@/lib/format";
import { getInventory } from "@/lib/ollama";

export const metadata = { title: "Agents & models" };

export default async function AdminAgentsPage() {
  const agents = listAgents();
  const sessions = listSessions();
  const inventory = await getInventory();
  const disabled = disabledModelNames();

  return (
    <>
      <PageHeader
        title="Agents and models"
        description="Turn agents on or off for everyone, cap how many run at once, and choose which models users can pick."
        actions={<LiveRefresh />}
      />

      <Section
        title="Agents"
        description="Turning an agent off stops its running sessions and rejects new ones for every user."
      >
        <div className="divide-y rounded-xl border bg-card">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              connected={CONNECTED_AGENTS.has(agent.id)}
              running={sessions.filter((session) => session.agentId === agent.id).length}
            />
          ))}
        </div>
      </Section>

      <Section title="Running sessions" description={`${sessions.length} in progress on this server process.`}>
        <TableCard>
          {sessions.length === 0 ? (
            <Empty>No agent sessions are running right now.</Empty>
          ) : (
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">User</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="pl-4">{session.userEmail}</TableCell>
                    <TableCell className="font-mono text-xs">{session.agentId}</TableCell>
                    <TableCell className="font-mono text-xs">{session.model}</TableCell>
                    <TableCell className="text-muted-foreground">{formatAgo(session.startedAt)}</TableCell>
                    <TableCell>
                      {session.conversationId ? (
                        <Link className="text-sm underline" href={`/admin/conversations/${session.conversationId}`}>
                          View
                        </Link>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <KillButton sessionId={session.id} label={`${session.userEmail}'s session`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </Section>

      <Section
        title="Model availability"
        description="Disabled models disappear from every user's picker and are rejected by the chat API."
        actions={<Link href="/chat/models" className="text-sm underline">Download more models</Link>}
      >
        <TableCard>
          {!inventory.ok ? (
            <Empty>{inventory.error}</Empty>
          ) : inventory.models.length === 0 ? (
            <Empty>No chat models are installed.</Empty>
          ) : (
            <ul className="divide-y">
              {inventory.models.map((model) => (
                <li key={model.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{model.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[model.parameterSize, formatBytes(model.size), model.quantization].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ModelToggle name={model.name} enabled={!disabled.has(model.name)} />
                </li>
              ))}
            </ul>
          )}
        </TableCard>
      </Section>
    </>
  );
}
