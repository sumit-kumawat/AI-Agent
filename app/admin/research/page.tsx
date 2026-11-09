import { ResearchForm } from "@/components/admin/research-form";
import { PageHeader } from "@/components/admin/ui";
import { publicResearchConfig } from "@/lib/research/config";

export const metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default function ResearchSettingsPage() {
  return (
    <>
      <PageHeader
        title="Deep Research sources"
        description="Where Deep Research searches. Reports cite only pages retrieved from these sources. Keys are encrypted on the server and never sent to browsers. Queries are sent to the sources you enable."
      />
      <ResearchForm initial={publicResearchConfig()} />
    </>
  );
}
