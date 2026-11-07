"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-heading text-4xl">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page hit an unexpected error. Try again, and if it keeps happening,
        check the server log.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
