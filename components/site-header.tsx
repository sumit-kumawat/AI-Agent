import Link from "next/link";
import { auth } from "@/lib/auth";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium">
          <Mark className="size-7 text-primary" />
          {BRAND.product}
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {signedIn ? (
            <Button asChild>
              <Link href="/chat">Open chat</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">
                  <span className="sm:hidden">Sign up</span>
                  <span className="hidden sm:inline">Create account</span>
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
