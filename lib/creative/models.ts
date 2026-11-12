/** Catalog of creative models permitted for later download/use. None are auto-downloaded. */
export type CreativeModel = {
  id: string;
  name: string;
  family: string;
  kind: "checkpoint" | "lora" | "vae" | "upscaler" | "video";
  licence: string;
  sizeHint: string;
  installed: boolean;
  notes: string;
};

export const CREATIVE_MODEL_CATALOG: CreativeModel[] = [
  {
    id: "sdxl-base-1.0",
    name: "SDXL 1.0 Base",
    family: "Stable Diffusion XL",
    kind: "checkpoint",
    licence: "CreativeML Open RAIL++-M",
    sizeHint: "~6.9 GB",
    installed: false,
    notes: "General image generation. Download into ComfyUI checkpoints when ready.",
  },
  {
    id: "flux-schnell",
    name: "FLUX.1 Schnell",
    family: "FLUX",
    kind: "checkpoint",
    licence: "Apache-2.0",
    sizeHint: "~24 GB (fp16)",
    installed: false,
    notes: "Fast FLUX variant. Requires a compatible ComfyUI graph.",
  },
  {
    id: "rembg-u2net",
    name: "U²-Net (rembg)",
    family: "rembg",
    kind: "checkpoint",
    licence: "Apache-2.0",
    sizeHint: "~176 MB",
    installed: false,
    notes: "Default rembg weights; fetched by rembg on first run if allowed.",
  },
  {
    id: "realesrgan-x4",
    name: "Real-ESRGAN x4",
    family: "Upscale",
    kind: "upscaler",
    licence: "BSD-3-Clause",
    sizeHint: "~64 MB",
    installed: false,
    notes: "Image upscaling. Wire through ComfyUI or a dedicated upscale job later.",
  },
  {
    id: "svd-xt",
    name: "Stable Video Diffusion XT",
    family: "SVD",
    kind: "video",
    licence: "Stability AI Community License",
    sizeHint: "~9 GB",
    installed: false,
    notes: "Short video generation. Deferred until a GPU worker is installed.",
  },
];

export function listCreativeModels() {
  return CREATIVE_MODEL_CATALOG.map((model) => ({ ...model }));
}
