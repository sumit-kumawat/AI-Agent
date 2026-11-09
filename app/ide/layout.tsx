import { AppLayout } from "@/components/app-layout";

export const dynamic = "force-dynamic";

export default function IdeLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
