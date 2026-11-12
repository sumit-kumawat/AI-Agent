import { redirect } from "next/navigation";

/** Workflow Builder was removed; keep the route so old bookmarks land on Studio. */
export default function WorkflowsRedirectPage() {
  redirect("/studio");
}
