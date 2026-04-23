export const SCENE_IMAGE_MODEL_IDS = ["grok-imagine-image-lite", "gpt-image-2"] as const;

export type SceneImageModelId = (typeof SCENE_IMAGE_MODEL_IDS)[number];

export const SCENE_IMAGE_MODEL_LABELS: Record<SceneImageModelId, string> = {
  "grok-imagine-image-lite": "Grok Imagine Image Lite",
  "gpt-image-2": "GPT Image 2",
};

export function parseSceneImageModelId(v: unknown): SceneImageModelId | null {
  if (typeof v !== "string") return null;
  return (SCENE_IMAGE_MODEL_IDS as readonly string[]).includes(v) ? (v as SceneImageModelId) : null;
}

export const DEFAULT_SCENE_IMAGE_MODEL: SceneImageModelId = "grok-imagine-image-lite";

export const SCENE_IMAGE_MODEL_OPTIONS: { id: SceneImageModelId; label: string }[] =
  SCENE_IMAGE_MODEL_IDS.map((id) => ({ id, label: SCENE_IMAGE_MODEL_LABELS[id] }));
