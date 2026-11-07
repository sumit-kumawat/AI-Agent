import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
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

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Mark className="mb-2 size-8 text-primary" />
            <CardTitle className="font-heading text-3xl">
              Create an account
            </CardTitle>
            <CardDescription>
              Create your {BRAND.product} account to start chatting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </main>
      <footer className="pb-6 text-center">
        <ConzexCredit />
      </footer>
    </div>
  );
}
