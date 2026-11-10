import { redirect } from "next/navigation";

/** Settings open as a dialog over chat; this keeps /settings links working. */
export default function SettingsPage() {
  redirect("/chat#settings/general");
}
