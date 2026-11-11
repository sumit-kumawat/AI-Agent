export function textFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

/** Reasoning parts from the AI SDK (DeepThink / thinking models). */
export function reasoningFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "reasoning" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}
