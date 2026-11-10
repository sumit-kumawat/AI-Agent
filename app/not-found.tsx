import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

function Body({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6" data-not-found>
      <FileQuestion className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">The link may be old, or the page may have moved.</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={signedIn ? "/chat" : "/login"}>{signedIn ? "Go to chat" : "Sign in"}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/help">Help</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function NotFound() {
  const session = await auth();
  if (session?.user?.id) {
    return (
      <AppLayout>
        <PageFrame title="Page not found">
          <Body signedIn />
        </PageFrame>
      </AppLayout>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-24">
      <h1 className="font-heading text-3xl">Page not found</h1>
      <Body signedIn={false} />
    </main>
  );
}
