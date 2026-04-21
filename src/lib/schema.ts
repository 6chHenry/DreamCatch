import { z } from "zod";

const nullableString = z.string().nullable().optional().transform(v => v ?? undefined);
const nullableNumber = z.number().nullable().optional().transform(v => v ?? undefined);
const nullableBoolean = z.boolean().nullable().optional().transform(v => v ?? undefined);

/** 模型常漏写字段；空串或缺省统一成空字符串。 */
const optionalTrimmedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

/** LLM 常漏写 id；解析时按序号补全 scene_1 / char_1。 */
export const SceneRawSchema = z.object({
  id: z.string().optional(),
  description: z.string(),
  lighting: nullableString,
  weather: nullableString,
  colorTone: nullableString,
  spatialLayout: nullableString,
});

export const SceneSchema = z.object({
  id: z.string(),
  description: z.string(),
  lighting: nullableString,
  weather: nullableString,
  colorTone: nullableString,
  spatialLayout: nullableString,
});

export const CharacterRawSchema = z.object({
  id: z.string().optional(),
  identity: z.string(),
  name: nullableString,
  appearance: nullableString,
  relationship: nullableString,
});

export const CharacterSchema = z.object({
  id: z.string(),
  identity: z.string(),
  name: nullableString,
  appearance: nullableString,
  relationship: nullableString,
});

export const NarrativeEventSchema = z.object({
  description: z.string(),
  cause: nullableString,
  isTurningPoint: nullableBoolean,
});

export const NarrativeSchema = z.object({
  events: z.array(NarrativeEventSchema),
  summary: z.string(),
});

/** 模型常漏写 type / 错写 intensity；补默认值以通过校验。 */
const emotionIntensity = z
  .union([z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (typeof v !== "number" || Number.isNaN(v)) return 5;
    return Math.min(10, Math.max(0, v));
  });

export const EmotionSchema = z.object({
  timestamp: nullableString,
  type: optionalTrimmedString,
  intensity: emotionIntensity,
  trigger: nullableString,
});

export const SensorySchema = z.object({
  auditory: nullableString,
  tactile: nullableString,
  olfactory: nullableString,
  temperature: nullableString,
  kinesthetic: nullableString,
});

export const AnomalySchema = z.object({
  description: z.string(),
  type: z.enum(["physics_violation", "spatial_jump", "time_distortion", "identity_shift", "other"]),
});

export const DreamMetaSchema = z.object({
  isLucidDream: nullableBoolean,
  isDreamWithinDream: nullableBoolean,
  isRecurringDream: nullableBoolean,
  recurrenceCount: nullableNumber,
  dreamDate: nullableString,
  dreamTime: nullableString,
});

export const LowConfidenceItemSchema = z.object({
  field: optionalTrimmedString,
  value: optionalTrimmedString,
  reason: optionalTrimmedString,
});

const scenesWithIds = z.array(SceneRawSchema).transform((arr) =>
  arr.map((s, i) =>
    SceneSchema.parse({
      ...s,
      id: s.id?.trim() || `scene_${i + 1}`,
    })
  )
);

const charactersWithIds = z.array(CharacterRawSchema).transform((arr) =>
  arr.map((c, i) =>
    CharacterSchema.parse({
      ...c,
      id: c.id?.trim() || `char_${i + 1}`,
    })
  )
);

export const DreamStructuredSchema = z.object({
  scenes: scenesWithIds,
  characters: charactersWithIds,
  narrative: NarrativeSchema,
  emotions: z.array(EmotionSchema),
  sensory: SensorySchema,
  anomalies: z.array(AnomalySchema),
  meta: DreamMetaSchema,
  lowConfidence: z.array(LowConfidenceItemSchema),
});

export const DreamSceneImageSchema = z.object({
  id: z.string(),
  sceneIndex: z.number(),
  imageUrl: z.string(),
  promptUsed: z.string(),
  isSelected: z.boolean(),
});

export const DreamSchema = z.object({
  id: z.string(),
  title: z.string(),
  rawText: z.string(),
  structured: DreamStructuredSchema,
  audioUrl: z.string().optional(),
  scenes: z.array(DreamSceneImageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
