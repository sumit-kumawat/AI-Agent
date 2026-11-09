import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findUserById } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

function safeNext(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await requireUser();
  const user = findUserById(session.id);
  const forced = Boolean(user?.firstLogin);
  const params = await searchParams;
  const next = safeNext(params.next, user?.role === "admin" ? "/admin" : "/chat");

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">
              {forced ? "Choose a new password" : "Change password"}
            </CardTitle>
            <CardDescription>
              {forced
                ? "This account was set up with a temporary password. Pick your own before continuing."
                : "You will stay signed in here. Other devices are signed out."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm next={next} cancellable={!forced} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
