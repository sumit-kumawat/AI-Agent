/** Shared by the research pipeline and the chat UI. */

export type ResearchStep = {
  id: string;
  kind: "plan" | "search" | "read" | "write";
  label: string;
  status: "running" | "done" | "failed" | "skipped";
  detail?: string;
};

export type ResearchSource = {
  n: number;
  title: string;
  url: string;
  /** Search provider that returned it, e.g. "Wikipedia". */
  via: string;
  /** False when the page could not be opened and only the search snippet was used. */
  read: boolean;
  cited: boolean;
};

export type ResearchData = {
  status: "running" | "done" | "failed";
  queries: string[];
  steps: ResearchStep[];
  sources: ResearchSource[];
  /** Files from the conversation that were used alongside web sources. */
  files: string[];
  error?: string;
  /** Paragraphs under Findings with no citation; they are unverified. */
  uncited?: number;
  /** Citations to numbers that are not in the source list; they were removed. */
  removedCitations?: number[];
  startedAt: number;
  finishedAt?: number;
};
