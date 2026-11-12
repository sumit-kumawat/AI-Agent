export type CreativeJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type CreativeJobKind =
  | "image.generate"
  | "video.generate"
  | "rembg.run"
  | "media.convert"
  | "workflow.run";

export type EngineId = "ffmpeg" | "comfyui" | "rembg";

export type EngineStatus = {
  id: EngineId;
  label: string;
  kind: string;
  available: boolean;
  path: string | null;
  url: string | null;
  detail: string | null;
  setup: string;
};

export type CreativeAssetRow = {
  id: string;
  userId: string;
  kind: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  meta: Record<string, unknown>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type CreativeJobRow = {
  id: string;
  userId: string;
  kind: CreativeJobKind | string;
  status: CreativeJobStatus | string;
  progress: number;
  worker: string | null;
  error: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  lockedAt: number | null;
  heartbeatAt: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type StudioModule = {
  slug: string;
  title: string;
  description: string;
  group: "create" | "manage";
  /** Engines that must be available before Generate is enabled. */
  requires: EngineId[];
};

export const STUDIO_MODULES: StudioModule[] = [
  {
    slug: "image",
    title: "Image Studio",
    description: "Generate still images once a ComfyUI (or Diffusers) engine is connected.",
    group: "create",
    requires: ["comfyui"],
  },
  {
    slug: "video",
    title: "Video Studio",
    description: "Generate short clips. Needs ComfyUI plus FFmpeg for encoding.",
    group: "create",
    requires: ["comfyui", "ffmpeg"],
  },
  {
    slug: "rembg",
    title: "Background Removal",
    description: "Cut subjects from photos with rembg when the CPU worker can find it.",
    group: "create",
    requires: ["rembg"],
  },
  {
    slug: "media",
    title: "Media Tools",
    description: "Convert, trim, and probe media files with FFmpeg.",
    group: "create",
    requires: ["ffmpeg"],
  },
  {
    slug: "workflows",
    title: "Workflow Builder",
    description: "Design node graphs for later execution. Live runs ship in a later phase.",
    group: "create",
    requires: [],
  },
  {
    slug: "creations",
    title: "My Creations",
    description: "Browse, filter, and delete assets you own under Creative Studio.",
    group: "manage",
    requires: [],
  },
  {
    slug: "models",
    title: "Model Library",
    description: "Catalog of permitted creative models with licence notes and download status.",
    group: "manage",
    requires: [],
  },
  {
    slug: "queue",
    title: "Processing Queue",
    description: "Live jobs from the Creative Studio queue.",
    group: "manage",
    requires: [],
  },
  {
    slug: "automation",
    title: "Automation & Scheduler",
    description: "Schedule creative jobs. The daemon that runs them without a browser comes later.",
    group: "manage",
    requires: [],
  },
  {
    slug: "settings",
    title: "Creative Settings",
    description: "Engine paths and URLs discovered on this host.",
    group: "manage",
    requires: [],
  },
];

export function studioModule(slug: string) {
  return STUDIO_MODULES.find((module) => module.slug === slug) ?? null;
}
