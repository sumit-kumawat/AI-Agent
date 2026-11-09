import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";

/** For portal pages: the signed-in, active account, or a trip to the sign-in page. */
export async function requireCustomer(next = "/portal") {
  const session = await auth();
  const user = session?.user?.id ? findUserById(session.user.id) : undefined;
  if (!user || user.suspended) redirect(`/login?callbackUrl=${encodeURIComponent(next)}`);
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function customerAction() {
  const session = await auth();
  const user = session?.user?.id ? findUserById(session.user.id) : undefined;
  if (!user || user.suspended) throw new Error("Sign in again to continue.");
  return user;
}
