/** A model the user can pick. `key` is only an identifier; it is not a model name. */
export type ModelOption = {
  key: string;
  providerId: string;
  modelId: string;
  name: string;
  providerName: string;
  /** Runs on this server (Ollama). Cloud models send the conversation to that provider. */
  local: boolean;
  parameterSize: string | null;
  size: number;
  /** Accepts images. */
  vision: boolean;
};

const SEP = "\u001f";

export function modelKey(providerId: string, modelId: string) {
  return `${providerId}${SEP}${modelId}`;
}

/** Accepts a key, or a legacy bare Ollama model name such as "llama3.2:1b". */
export function parseModelRef(value: string | null | undefined): { providerId: string; modelId: string } | null {
  if (!value) return null;
  const split = value.indexOf(SEP);
  if (split > 0) {
    return { providerId: value.slice(0, split), modelId: value.slice(split + 1) };
  }
  return { providerId: "ollama", modelId: value };
}
