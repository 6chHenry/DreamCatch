export interface Scene {
  id: string;
  description: string;
  lighting?: string;
  weather?: string;
  colorTone?: string;
  spatialLayout?: string;
}

export interface Character {
  id: string;
  identity: string;
  name?: string;
  appearance?: string;
  relationship?: string;
}

export interface Person {
  id: string;
  name: string;
  appearances: number;
  firstSeen: string;
  lastSeen: string;
  /** 人物库短标签（如 老师、同学），可由同步梦境时从关系长句抽取或手填 */
  tags: string[];
  /** 从各条梦境「关系」字段汇总的原文备注（长句） */
  relationshipNotes: string[];
  dreamIds: string[];
  /** 本地文件名，位于 data/person-reference/，由上传接口写入 */
  referenceImageFilename?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NarrativeEvent {
  description: string;
  cause?: string;
  isTurningPoint?: boolean;
}

export interface Narrative {
  events: NarrativeEvent[];
  summary: string;
}

export interface Emotion {
  timestamp?: string;
  type: string;
  intensity: number;
  trigger?: string;
}

export interface Sensory {
  auditory?: string;
  tactile?: string;
  olfactory?: string;
  temperature?: string;
  kinesthetic?: string;
}

export interface Anomaly {
  description: string;
  type: "physics_violation" | "spatial_jump" | "time_distortion" | "identity_shift" | "other";
}

export interface DreamMeta {
  isLucidDream?: boolean;
  isDreamWithinDream?: boolean;
  isRecurringDream?: boolean;
  recurrenceCount?: number;
  dreamDate?: string;
  dreamTime?: string;
}

export interface LowConfidenceItem {
  field: string;
  value: string;
  reason: string;
}

export interface DreamStructured {
  scenes: Scene[];
  characters: Character[];
  narrative: Narrative;
  emotions: Emotion[];
  sensory: Sensory;
  anomalies: Anomaly[];
  meta: DreamMeta;
  lowConfidence: LowConfidenceItem[];
}

export interface DreamSceneImage {
  id: string;
  sceneIndex: number;
  imageUrl: string;
  promptUsed: string;
  isSelected: boolean;
  /** 生图接口返回的失败原因（若有） */
  error?: string;
}

/** 与 /api/render 的 scenePrompts 一致，用于详情页展示与再次生图 */
export interface DreamScenePrompt {
  sceneIndex: number;
  prompts: string[];
}

/**
 * 全局视觉风格锚点，由 LLM 在生成场景提示词时同步产出。
 * 在后端注入为每张图片 prompt 的前缀，确保整条梦境的画风、色调、人物外貌跨场景一致。
 */
export interface StyleGuide {
  /** 整体画风，如"柔和水彩梦幻风格，笔触轻盈，光晕朦胧" */
  artStyle?: string;
  /** 全片色调方向，如"冷蓝紫主调，暖金点缀，低饱和度" */
  colorPalette?: string;
  /** 2～4 个氛围词，如"飘渺、宁静、轻盈" */
  moodKeywords?: string;
  /** key 为人物名/称呼，value 为其外貌与服装的固定描述，用于跨场景人物一致性 */
  characterAnchors?: Record<string, string>;
}

export interface Dream {
  id: string;
  title: string;
  rawText: string;
  structured: DreamStructured;
  audioUrl?: string;
  audioFileName?: string;
  scenes: DreamSceneImage[];
  /** 各场景生图提示词（优先于 scenes[].promptUsed 展示多候选） */
  sceneRenderPrompts?: DreamScenePrompt[];
  /** 生图时使用的全局视觉风格锚点，与 sceneRenderPrompts 同步保存 */
  sceneStyleGuide?: StyleGuide;
  videoUrl?: string;
  /** 详情页「AI 梦境解读」生成后持久化 */
  aiInterpretation?: string;
  /** 若存在：仅从日志列表隐藏，**不**从 data/dreams.json 删除正文与图片等数据 */
  deletedAt?: string;
  /** 用户随手记的感想/备注，与 AI 解读分开 */
  userNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeMessage {
  id: string;
  dreamId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export type DreamFlowStep = "recording" | "transcribing" | "polishing" | "parsing" | "probing" | "rendering" | "video" | "complete";
