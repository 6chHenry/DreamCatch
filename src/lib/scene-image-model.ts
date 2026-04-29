export const SCENE_IMAGE_MODEL_IDS = [
  "grok-imagine-image-lite",
  "gpt-image-2",
  "gpt-image-2-pro",
] as const;

export type SceneImageModelId = (typeof SCENE_IMAGE_MODEL_IDS)[number];

export const SCENE_IMAGE_MODEL_LABELS: Record<SceneImageModelId, string> = {
  "grok-imagine-image-lite": "Grok Imagine Image Lite",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-pro": "GPT Image 2 Pro",
};

/** 与 gpt-image-2 共用 GPT_IMAGE2_* 与同一套 images 接口。 */
export function isGptImage2PipelineModel(id: SceneImageModelId): boolean {
  return id === "gpt-image-2" || id === "gpt-image-2-pro";
}

export function parseSceneImageModelId(v: unknown): SceneImageModelId | null {
  if (typeof v !== "string") return null;
  return (SCENE_IMAGE_MODEL_IDS as readonly string[]).includes(v) ? (v as SceneImageModelId) : null;
}

export const DEFAULT_SCENE_IMAGE_MODEL: SceneImageModelId = "grok-imagine-image-lite";

export const SCENE_IMAGE_MODEL_OPTIONS: { id: SceneImageModelId; label: string }[] =
  SCENE_IMAGE_MODEL_IDS.map((id) => ({ id, label: SCENE_IMAGE_MODEL_LABELS[id] }));
