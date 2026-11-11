/** A link the server tried to open for a chat reply. */
export type WebSource = { url: string; title: string; ok: boolean; error?: string; chars?: number };

/**
 * A numbered source for Search mode (and the sources SSE event).
 * `cited` is updated after the answer is generated.
 */
export type SearchSource = {
  id: string;
  title: string;
  url: string;
  read: boolean;
  cited: boolean;
  snippet?: string;
};
