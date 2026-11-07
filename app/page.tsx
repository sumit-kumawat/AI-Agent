import type { Metadata } from "next";
import { HomePage } from "@/components/landing/home";
import { auth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.product} · Private AI chat by ${BRAND.company}` },
  description: BRAND.description,
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  return <HomePage signedIn={Boolean(session?.user?.id)} />;
}
