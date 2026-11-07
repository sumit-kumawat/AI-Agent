export type CatalogModel = {
  name: string;
  label: string;
  params: string;
  download: string;
  /** Rough memory needed to run at the default 4-bit quantization. */
  memory: string;
  tags: ("fast" | "general" | "code" | "reasoning" | "vision" | "multilingual")[];
  license: string;
};

export type CatalogGroup = { title: string; detail: string; models: CatalogModel[] };

export const MODEL_CATALOG: CatalogGroup[] = [
  {
    title: "Small · 1B to 2B",
    detail: "Fastest replies. Runs on almost any laptop or phone-class hardware.",
    models: [
      { name: "llama3.2:1b", label: "Llama 3.2 1B", params: "1.2B", download: "1.3 GB", memory: "2 GB", tags: ["fast", "general", "multilingual"], license: "Llama 3.2 Community" },
      { name: "gemma3:1b", label: "Gemma 3 1B", params: "1B", download: "815 MB", memory: "2 GB", tags: ["fast", "general"], license: "Gemma" },
      { name: "qwen2.5:1.5b", label: "Qwen 2.5 1.5B", params: "1.5B", download: "986 MB", memory: "2 GB", tags: ["fast", "general", "multilingual"], license: "Apache-2.0" },
      { name: "qwen2.5-coder:1.5b", label: "Qwen 2.5 Coder 1.5B", params: "1.5B", download: "986 MB", memory: "2 GB", tags: ["fast", "code"], license: "Apache-2.0" },
      { name: "deepseek-r1:1.5b", label: "DeepSeek R1 1.5B", params: "1.5B", download: "1.1 GB", memory: "2 GB", tags: ["fast", "reasoning"], license: "MIT" },
      { name: "qwen3:1.7b", label: "Qwen 3 1.7B", params: "1.7B", download: "1.4 GB", memory: "3 GB", tags: ["fast", "reasoning", "multilingual"], license: "Apache-2.0" },
      { name: "smollm2:1.7b", label: "SmolLM2 1.7B", params: "1.7B", download: "1.8 GB", memory: "3 GB", tags: ["fast", "general"], license: "Apache-2.0" },
    ],
  },
  {
    title: "Compact · 3B to 4B",
    detail: "Good quality for everyday chat while staying quick on 8 GB of memory.",
    models: [
      { name: "llama3.2:3b", label: "Llama 3.2 3B", params: "3.2B", download: "2.0 GB", memory: "4 GB", tags: ["fast", "general", "multilingual"], license: "Llama 3.2 Community" },
      { name: "qwen2.5:3b", label: "Qwen 2.5 3B", params: "3.1B", download: "1.9 GB", memory: "4 GB", tags: ["general", "multilingual"], license: "Qwen Research" },
      { name: "qwen2.5-coder:3b", label: "Qwen 2.5 Coder 3B", params: "3.1B", download: "1.9 GB", memory: "4 GB", tags: ["code"], license: "Qwen Research" },
      { name: "phi4-mini", label: "Phi-4 Mini", params: "3.8B", download: "2.5 GB", memory: "5 GB", tags: ["general", "reasoning"], license: "MIT" },
      { name: "gemma3:4b", label: "Gemma 3 4B", params: "4.3B", download: "3.3 GB", memory: "6 GB", tags: ["general", "vision", "multilingual"], license: "Gemma" },
      { name: "qwen3:4b", label: "Qwen 3 4B", params: "4B", download: "2.6 GB", memory: "5 GB", tags: ["reasoning", "multilingual"], license: "Apache-2.0" },
    ],
  },
  {
    title: "Standard · 7B to 9B",
    detail: "The sweet spot for quality. Needs about 8 to 10 GB of memory.",
    models: [
      { name: "llama3.1:8b", label: "Llama 3.1 8B", params: "8B", download: "4.9 GB", memory: "8 GB", tags: ["general", "multilingual"], license: "Llama 3.1 Community" },
      { name: "qwen2.5:7b", label: "Qwen 2.5 7B", params: "7.6B", download: "4.7 GB", memory: "8 GB", tags: ["general", "multilingual"], license: "Apache-2.0" },
      { name: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B", params: "7.6B", download: "4.7 GB", memory: "8 GB", tags: ["code"], license: "Apache-2.0" },
      { name: "qwen3:8b", label: "Qwen 3 8B", params: "8.2B", download: "5.2 GB", memory: "9 GB", tags: ["reasoning", "multilingual"], license: "Apache-2.0" },
      { name: "deepseek-r1:7b", label: "DeepSeek R1 7B", params: "7.6B", download: "4.7 GB", memory: "8 GB", tags: ["reasoning"], license: "MIT" },
      { name: "mistral:7b", label: "Mistral 7B", params: "7.2B", download: "4.1 GB", memory: "8 GB", tags: ["general"], license: "Apache-2.0" },
      { name: "granite3.3:8b", label: "Granite 3.3 8B", params: "8.2B", download: "4.9 GB", memory: "9 GB", tags: ["general", "code"], license: "Apache-2.0" },
      { name: "gemma2:9b", label: "Gemma 2 9B", params: "9.2B", download: "5.4 GB", memory: "10 GB", tags: ["general"], license: "Gemma" },
    ],
  },
  {
    title: "Large · 12B to 16B",
    detail: "Noticeably stronger answers. Plan for 12 to 16 GB of memory.",
    models: [
      { name: "gemma3:12b", label: "Gemma 3 12B", params: "12B", download: "8.1 GB", memory: "12 GB", tags: ["general", "vision", "multilingual"], license: "Gemma" },
      { name: "mistral-nemo:12b", label: "Mistral Nemo 12B", params: "12B", download: "7.1 GB", memory: "12 GB", tags: ["general", "multilingual"], license: "Apache-2.0" },
      { name: "qwen2.5-coder:14b", label: "Qwen 2.5 Coder 14B", params: "14.8B", download: "9.0 GB", memory: "14 GB", tags: ["code"], license: "Apache-2.0" },
      { name: "qwen2.5:14b", label: "Qwen 2.5 14B", params: "14.8B", download: "9.0 GB", memory: "14 GB", tags: ["general", "multilingual"], license: "Apache-2.0" },
      { name: "qwen3:14b", label: "Qwen 3 14B", params: "14.8B", download: "9.3 GB", memory: "14 GB", tags: ["reasoning", "multilingual"], license: "Apache-2.0" },
      { name: "deepseek-r1:14b", label: "DeepSeek R1 14B", params: "14.8B", download: "9.0 GB", memory: "14 GB", tags: ["reasoning"], license: "MIT" },
      { name: "phi4:14b", label: "Phi-4 14B", params: "14.7B", download: "9.1 GB", memory: "14 GB", tags: ["general", "reasoning"], license: "MIT" },
      { name: "deepseek-coder-v2:16b", label: "DeepSeek Coder V2 16B", params: "16B", download: "8.9 GB", memory: "14 GB", tags: ["code"], license: "DeepSeek" },
    ],
  },
  {
    title: "Extra large · 24B to 32B",
    detail: "Near frontier quality on a workstation. Needs 20 to 32 GB of memory.",
    models: [
      { name: "mistral-small:24b", label: "Mistral Small 24B", params: "24B", download: "14 GB", memory: "20 GB", tags: ["general", "multilingual"], license: "Apache-2.0" },
      { name: "gemma3:27b", label: "Gemma 3 27B", params: "27B", download: "17 GB", memory: "24 GB", tags: ["general", "vision", "multilingual"], license: "Gemma" },
      { name: "qwen3:30b", label: "Qwen 3 30B (MoE)", params: "30B", download: "19 GB", memory: "24 GB", tags: ["fast", "reasoning", "multilingual"], license: "Apache-2.0" },
      { name: "qwen2.5-coder:32b", label: "Qwen 2.5 Coder 32B", params: "32.8B", download: "20 GB", memory: "28 GB", tags: ["code"], license: "Apache-2.0" },
      { name: "qwen3:32b", label: "Qwen 3 32B", params: "32.8B", download: "20 GB", memory: "28 GB", tags: ["reasoning", "multilingual"], license: "Apache-2.0" },
      { name: "deepseek-r1:32b", label: "DeepSeek R1 32B", params: "32.8B", download: "20 GB", memory: "28 GB", tags: ["reasoning"], license: "MIT" },
      { name: "qwq:32b", label: "QwQ 32B", params: "32.8B", download: "20 GB", memory: "28 GB", tags: ["reasoning"], license: "Apache-2.0" },
    ],
  },
  {
    title: "Huge · 70B",
    detail: "Best open quality. Needs about 48 GB of memory and is slow without a large GPU.",
    models: [
      { name: "llama3.3:70b", label: "Llama 3.3 70B", params: "70B", download: "43 GB", memory: "48 GB", tags: ["general", "multilingual"], license: "Llama 3.3 Community" },
      { name: "qwen2.5:72b", label: "Qwen 2.5 72B", params: "72.7B", download: "47 GB", memory: "52 GB", tags: ["general", "multilingual"], license: "Qwen" },
      { name: "deepseek-r1:70b", label: "DeepSeek R1 70B", params: "70.6B", download: "43 GB", memory: "48 GB", tags: ["reasoning"], license: "MIT" },
    ],
  },
];
