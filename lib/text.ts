export function textFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}
