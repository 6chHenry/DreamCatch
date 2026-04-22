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
  relationships: string[];
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
}

export interface Dream {
  id: string;
  title: string;
  rawText: string;
  structured: DreamStructured;
  audioUrl?: string;
  audioFileName?: string;
  scenes: DreamSceneImage[];
  videoUrl?: string;
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
