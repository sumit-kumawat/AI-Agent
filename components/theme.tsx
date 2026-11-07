"use client";

import type { ReactNode } from "react";
import { FeedbackProvider } from "@/components/feedback";

/** App-wide client providers. The app uses a single light theme. */
export function Providers({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
