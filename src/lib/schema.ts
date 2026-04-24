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

/** 模型常把五感写成 string[]；折叠为一条文案，与 Sensory 类型一致。 */
const sensoryTextField = z
  .union([
    z.string(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
    z.null(),
    z.undefined(),
  ])
  .transform((v): string | undefined => {
    if (v == null || v === undefined) return undefined;
    if (Array.isArray(v)) {
      const parts = v
        .map((x) => (typeof x === "string" ? x.trim() : String(x)))
        .filter((s) => s.length > 0);
      return parts.length ? parts.join("；") : undefined;
    }
    const s = v.trim();
    return s.length ? s : undefined;
  });

export const SensorySchema = z.object({
  auditory: sensoryTextField,
  tactile: sensoryTextField,
  olfactory: sensoryTextField,
  temperature: sensoryTextField,
  kinesthetic: sensoryTextField,
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
  sensory: z.preprocess(
    (val) => (val === null || val === undefined ? {} : val),
    SensorySchema
  ),
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
  error: z.string().optional(),
});

export const DreamScenePromptSchema = z.object({
  sceneIndex: z.number(),
  prompts: z.array(z.string()),
});

export const DreamSchema = z.object({
  id: z.string(),
  title: z.string(),
  rawText: z.string(),
  structured: DreamStructuredSchema,
  audioUrl: z.string().optional(),
  audioFileName: z.string().optional(),
  scenes: z.array(DreamSceneImageSchema),
  sceneRenderPrompts: z.array(DreamScenePromptSchema).optional(),
  videoUrl: z.string().optional(),
  aiInterpretation: z.string().optional(),
  userNotes: z.string().optional(),
  deletedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
