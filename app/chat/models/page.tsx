import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/session";

/** Model management moved to the admin panel; customers pick models in the composer. */
export default async function ModelsPage() {
  const user = await requireUser();
  redirect(isAdmin(user) ? "/admin/models" : "/chat");
}
