import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { STUDIO_MODULES } from "@/lib/creative/types";

export const metadata = { title: "Creative Studio" };

export default function StudioHomePage() {
  const tools = STUDIO_MODULES.filter((module) => module.group === "studio");
  const library = STUDIO_MODULES.filter((module) => module.group === "library");
  return (
    <PageFrame
      title="Creative Studio"
      description="Image, video, and media tools in one place. Generation stays off until the required engines are installed."
    >
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tools</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {tools.map((module) => (
            <li key={module.slug}>
              <Link href={`/studio/${module.slug}`} className="block rounded-xl border bg-card p-4 hover:bg-muted/40">
                <span className="font-medium">{module.title}</span>
                <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Library</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {library.map((module) => (
            <li key={module.slug}>
              <Link href={`/studio/${module.slug}`} className="block rounded-xl border bg-card p-4 hover:bg-muted/40">
                <span className="font-medium">{module.title}</span>
                <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
}
