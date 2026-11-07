import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Mark } from "@/components/brand";
import { ConzexCredit } from "@/components/conzex-credit";
import { BRAND } from "@/lib/brand";
import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

function safeCallback(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/chat";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Mark className="mb-2 size-8 text-primary" />
            <CardTitle className="font-heading text-3xl">Sign in</CardTitle>
            <CardDescription>
              Use your {BRAND.product} email or username and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={callbackUrl} />
          </CardContent>
        </Card>
      </main>
      <footer className="pb-6 text-center">
        <ConzexCredit />
      </footer>
    </div>
  );
}
