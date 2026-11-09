// Client-safe model descriptions built only from verifiable facts: what
// Ollama reports for the installed model, the window it actually runs with,
// the model's published family, and what this app adds (document text).

export type CapabilityId = "text" | "reasoning" | "coding" | "images" | "documents" | "multilingual" | "tools" | "long-context";

export type Capability = {
  id: CapabilityId;
  label: string;
  /** Where the claim comes from, shown on hover. */
  source: string;
};

export type ContextWindow = {
  /** Tokens one conversation can hold with this model here; null when not known. */
  tokens: number | null;
  /** The model's own maximum, which can be larger than what this server runs it with. */
  max: number | null;
  /**
   * running: read from Ollama for the loaded model (exact).
   * model: the model's own num_ctx setting. server: this server's default, seen on another model.
   * maximum: only the model maximum is known.
   */
  source: "running" | "model" | "server" | "maximum" | null;
};

export type ModelProfile = {
  capabilities: Capability[];
  limitations: string[];
  context: ContextWindow;
};

const LONG_CONTEXT = 32_768;

/** Published multilingual support by model family; null when not established. */
function multilingual(id: string): string | null {
  if (/^gemma3/.test(id)) return "Google lists 140+ languages for Gemma 3";
  if (/^qwen2\.5(?!-coder)/.test(id) || /^qwen3/.test(id)) return "Alibaba lists 29+ languages for Qwen 2.5";
  if (/^llama3\.[123]/.test(id)) return "Meta lists 8 supported languages for Llama 3.x";
  return null;
}

function billions(parameterSize: string | null) {
  const match = /([\d.]+)\s*([BM])/i.exec(parameterSize ?? "");
  if (!match) return null;
  const value = Number(match[1]);
  return match[2]!.toUpperCase() === "M" ? value / 1000 : value;
}

export function describeModel(input: {
  name: string;
  local: boolean;
  capabilities: string[];
  vision: boolean;
  parameterSize: string | null;
  context: ContextWindow;
  /** Whether the server opens links pasted into chat. */
  webLinks: boolean;
}): ModelProfile {
  const id = input.name.toLowerCase();
  const reported = (capability: string) => input.capabilities.includes(capability);
  const caps: Capability[] = [{ id: "text", label: "Text", source: input.local ? "Ollama: completion" : "Chat model" }];
  if (reported("thinking")) caps.push({ id: "reasoning", label: "Reasoning", source: "Ollama: thinking" });
  if (/coder|codellama|codegemma|starcoder|devstral|codestral/.test(id)) {
    caps.push({ id: "coding", label: "Coding", source: "Code-tuned model family" });
  }
  if (input.vision) {
    caps.push({ id: "images", label: "Image input", source: input.local ? "Ollama: vision" : "Model family accepts images" });
  }
  caps.push({ id: "documents", label: "Documents", source: "This app extracts text from PDFs, Word, Excel and text files" });
  const languages = multilingual(id);
  if (languages) caps.push({ id: "multilingual", label: "Multilingual", source: languages });
  if (reported("tools")) caps.push({ id: "tools", label: "Tool calling", source: "Ollama: tools" });
  if (input.context.tokens !== null && input.context.tokens >= LONG_CONTEXT) {
    caps.push({ id: "long-context", label: "Long context", source: `${input.context.tokens.toLocaleString("en-US")} tokens here` });
  }

  const limitations: string[] = [];
  if (!input.vision) limitations.push("Cannot see images; documents are read as extracted text.");
  const size = billions(input.parameterSize);
  if (size !== null && size < 3) limitations.push("Small model: fast, but less reliable on complex or factual questions.");
  if (reported("thinking")) limitations.push("Thinks before answering, so replies take longer.");
  if (input.context.tokens !== null && input.context.tokens < 16_384) {
    limitations.push(`Short context: about ${input.context.tokens.toLocaleString("en-US")} tokens; older messages are summarised sooner.`);
  }
  if (input.context.tokens === null) limitations.push("Context window not reported; long chats are summarised conservatively.");
  if (!input.local) limitations.push("Runs at an external provider; messages are sent to it.");
  limitations.push(
    input.webLinks
      ? "Reads web pages only from links you paste; it cannot search the web in chat (Deep Research can)."
      : "Cannot visit websites in this configuration; paste the page content instead.",
  );
  return { capabilities: caps, limitations, context: input.context };
}

export function contextLabel(context: ContextWindow) {
  if (context.tokens === null) return context.max ? `Up to ${formatK(context.max)} (model maximum)` : "Not reported";
  const base = `${formatK(context.tokens)} tokens`;
  if (context.source === "running") return `${base} (running)`;
  return base;
}

export function formatK(tokens: number) {
  return tokens >= 1000 ? `${Math.round(tokens / 1024)}K` : String(tokens);
}
