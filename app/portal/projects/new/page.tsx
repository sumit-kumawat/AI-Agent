import { submitProject } from "@/app/portal/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, stringParam } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireCustomer } from "@/lib/customer";
import { BUDGETS, PROJECT_TYPES, TIMELINES } from "@/lib/projects";

export const metadata = { title: "New request" };

const select = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCustomer("/portal/projects/new");
  const params = await searchParams;
  const type = stringParam(params.type);
  const title = stringParam(params.title);

  return (
    <>
      <PageHeader
        title="New request"
        description="Describe what you need. Our team replies on the request, and sends a proposal you can accept online when there is work to quote."
      />
      <ActionForm action={submitProject} className="grid max-w-2xl gap-4 rounded-xl border bg-card p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="project-type">Type</Label>
          <select id="project-type" name="type" defaultValue={type in PROJECT_TYPES ? type : "other"} className={select}>
            {Object.entries(PROJECT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="project-title">Title</Label>
          <Input id="project-title" name="title" required minLength={3} maxLength={150} defaultValue={title} className="h-10" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="project-requirements">Details</Label>
          <Textarea
            id="project-requirements"
            name="requirements"
            required
            minLength={10}
            maxLength={10000}
            rows={8}
            placeholder="Workloads, environments, traffic, software, deadlines… Do not include passwords or authorisation codes."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="project-budget">Budget</Label>
            <select id="project-budget" name="budget" className={select}>
              {Object.entries(BUDGETS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="project-timeline">Timeline</Label>
            <select id="project-timeline" name="timeline" className={select}>
              {Object.entries(TIMELINES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Button type="submit" className="rounded-full">Send request</Button>
        </div>
      </ActionForm>
    </>
  );
}
