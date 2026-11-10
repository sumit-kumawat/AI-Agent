export type ModelLicense = { family: string; license: string; url: string; notice?: string };

/** Matched against the installed model name, first match wins. */
const LICENSES: { test: RegExp; license: ModelLicense }[] = [
  {
    test: /^deepseek-r1/i,
    license: {
      family: "DeepSeek-R1 distilled models",
      license: "MIT License; the distilled weights also carry the licence of their Qwen2.5 or Llama base model",
      url: "https://github.com/deepseek-ai/DeepSeek-R1/blob/main/LICENSE",
    },
  },
  {
    test: /^llama3\.2/i,
    license: {
      family: "Llama 3.2",
      license: "Llama 3.2 Community License Agreement",
      url: "https://www.llama.com/llama3_2/license/",
      notice: "Built with Llama. Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.",
    },
  },
  {
    test: /^llama3\.1/i,
    license: {
      family: "Llama 3.1",
      license: "Llama 3.1 Community License Agreement",
      url: "https://www.llama.com/llama3_1/license/",
      notice: "Built with Llama. Llama 3.1 is licensed under the Llama 3.1 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.",
    },
  },
  {
    test: /^llama/i,
    license: { family: "Llama", license: "Meta Llama Community License", url: "https://www.llama.com/llama-downloads/", notice: "Built with Llama." },
  },
  {
    test: /^gemma/i,
    license: {
      family: "Gemma",
      license: "Gemma Terms of Use",
      url: "https://ai.google.dev/gemma/terms",
      notice: "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms.",
    },
  },
  {
    test: /^qwen/i,
    license: {
      family: "Qwen",
      license: "Apache License 2.0 for most sizes; some sizes (such as Qwen2.5 3B and 72B) use the Qwen licence",
      url: "https://huggingface.co/Qwen",
    },
  },
  { test: /^(mistral|mixtral)/i, license: { family: "Mistral", license: "Apache License 2.0", url: "https://mistral.ai/" } },
  { test: /^phi/i, license: { family: "Phi", license: "MIT License", url: "https://huggingface.co/microsoft" } },
];

/** Licences for the given model names, one entry per family; unknown models are listed so nothing is silently omitted. */
export function licensesFor(modelNames: string[]) {
  const known = new Map<string, ModelLicense>();
  const unknown: string[] = [];
  for (const name of modelNames) {
    const match = LICENSES.find((entry) => entry.test.test(name));
    if (match) known.set(match.license.family, match.license);
    else unknown.push(name);
  }
  return { known: [...known.values()], unknown };
}
