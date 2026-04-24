/**
 * 解析由梦境详情「导出 ZIP」生成的压缩包（dream.md + scene-*.png）。
 */

import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import type { Anomaly, Character, Dream, DreamStructured, Emotion, Scene } from "@/types/dream";

function parseChineseDateLine(s: string): string | null {
  const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parsePreamble(md: string): { title: string; dateRaw: string | null } {
  const titleM = md.match(/^#\s+(.+)$/m);
  const title = titleM?.[1]?.trim() || "导入的梦境";
  const dateM = md.match(/\*\*日期\*\*[：:]\s*(.+)$/m);
  const dateRaw = dateM?.[1]?.trim() ?? null;
  return { title, dateRaw };
}

function splitTopLevelSections(md: string): Map<string, string> {
  const map = new Map<string, string>();
  const firstSection = md.search(/\n## [^\n]+/);
  const body = firstSection >= 0 ? md.slice(firstSection + 1) : md;
  const parts = body.split(/\n(?=## [^\n]+)/);
  for (const part of parts) {
    const m = part.match(/^##\s+([^\n]+)\n([\s\S]*)$/);
    if (m) map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

function parseSceneChunk(chunk: string, sceneIndex1Based: number): {
  scene: Scene;
  prompt: string;
} {
  let text = chunk.replace(/^###\s*场景\s*\d+\s*\n?/m, "").trim();
  text = text.replace(/!\[场景\s*\d+\]\([^)]+\)\s*/g, "").trim();

  let prompt = "";
  const promptM = text.match(/\*\*生图 prompt\*\*[：:]\s*\n*```\s*\n([\s\S]*?)```/);
  if (promptM) {
    prompt = promptM[1].trim();
    text = text.replace(promptM[0], "").trim();
  }

  const lines = text.split("\n");
  const descLines: string[] = [];
  let lighting: string | undefined;
  let colorTone: string | undefined;
  let weather: string | undefined;
  let spatialLayout: string | undefined;

  for (const line of lines) {
    const lt = line.match(/^光线[：:]\s*(.+)$/);
    const ct = line.match(/^色调[：:]\s*(.+)$/);
    const wt = line.match(/^天气[：:]\s*(.+)$/);
    const sp = line.match(/^空间布局[：:]\s*(.+)$/);
    if (lt) lighting = lt[1].trim();
    else if (ct) colorTone = ct[1].trim();
    else if (wt) weather = wt[1].trim();
    else if (sp) spatialLayout = sp[1].trim();
    else if (line.trim()) descLines.push(line);
  }

  const description = descLines.join("\n").trim() || `场景 ${sceneIndex1Based}`;
  const idx = sceneIndex1Based - 1;

  return {
    scene: {
      id: `scene_${sceneIndex1Based}`,
      description,
      lighting,
      colorTone,
      weather,
      spatialLayout,
    },
    prompt,
  };
}

function parseScenesSection(section: string): Array<{ scene: Scene; prompt: string }> {
  const chunks = section.split(/\n(?=###\s*场景\s*\d+)/);
  const out: Array<{ scene: Scene; prompt: string }> = [];
  for (const ch of chunks) {
    if (!ch.trim()) continue;
    const m = ch.match(/###\s*场景\s*(\d+)/);
    const n = m ? parseInt(m[1], 10) : out.length + 1;
    if (!m || Number.isNaN(n) || n < 1) continue;
    out.push(parseSceneChunk(ch, n));
  }
  out.sort((a, b) => {
    const ia = parseInt(a.scene.id.replace("scene_", ""), 10);
    const ib = parseInt(b.scene.id.replace("scene_", ""), 10);
    return ia - ib;
  });
  return out;
}

function parseCharactersSection(section: string): Character[] {
  const chars: Character[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const m = line.match(/^-\s*\*\*(.+?)\*\*(.*)$/);
    if (!m) continue;
    const identity = m[1].trim();
    let rest = m[2].trim();
    let appearance: string | undefined;
    let relationship: string | undefined;
    if (rest.startsWith(":")) {
      rest = rest.slice(1).trim();
      const paren = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (paren) {
        appearance = paren[1].trim();
        relationship = paren[2].trim();
      } else {
        appearance = rest || undefined;
      }
    } else if (rest.startsWith("(") && rest.endsWith(")")) {
      relationship = rest.slice(1, -1).trim();
    }
    chars.push({
      id: `char_${chars.length + 1}`,
      identity,
      name: undefined,
      appearance,
      relationship,
    });
  }
  return chars;
}

function parseEmotionsSection(section: string): Emotion[] {
  const emotions: Emotion[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const m = line.match(/^-\s*(.+?)\s*\(\s*强度[：:]\s*(\d+)\s*\/\s*10\s*\)(?:\s*—\s*触发[：:]\s*(.+))?$/);
    if (m) {
      emotions.push({
        type: m[1].trim(),
        intensity: Number(m[2]),
        trigger: m[3]?.trim(),
      });
    }
  }
  return emotions;
}

function parseAnomaliesSection(section: string): Anomaly[] {
  const list: Anomaly[] = [];
  const lines = section.split("\n");
  for (const line of lines) {
    const m = line.match(/^-\s*(.+?)\s*\[([^\]]+)\]\s*$/);
    if (m) {
      const type = m[2].trim() as Anomaly["type"];
      const allowed: Anomaly["type"][] = [
        "physics_violation",
        "spatial_jump",
        "time_distortion",
        "identity_shift",
        "other",
      ];
      list.push({
        description: m[1].trim(),
        type: allowed.includes(type) ? type : "other",
      });
    }
  }
  return list;
}

const MAX_ZIP_BYTES = 80 * 1024 * 1024;

function findZipEntry(zip: JSZip, basename: string): JSZip.JSZipObject | null {
  const direct = zip.file(basename);
  if (direct) return direct;
  const want = basename.toLowerCase();
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    const seg = relativePath.split("/").pop();
    if (seg?.toLowerCase() === want) found = file;
  });
  return found;
}

export async function parseDreamExportZip(buffer: Buffer): Promise<Dream> {
  if (buffer.length > MAX_ZIP_BYTES) {
    throw new Error(`ZIP 超过 ${MAX_ZIP_BYTES / 1024 / 1024}MB 上限`);
  }

  const zip = await JSZip.loadAsync(buffer);
  const mdEntry = findZipEntry(zip, "dream.md");
  if (!mdEntry) {
    throw new Error("ZIP 内缺少 dream.md（请使用本应用导出的梦境 ZIP）");
  }
  const md = await mdEntry.async("string");

  const { title, dateRaw } = parsePreamble(md);
  const createdAt = (dateRaw && parseChineseDateLine(dateRaw)) || new Date().toISOString();
  const sections = splitTopLevelSections(md);

  const rawText = sections.get("原始口述") ?? "";
  const narrativeSummary = sections.get("叙事") ?? "";
  const aiInterpretation = sections.get("AI 梦境解读")?.trim() || undefined;
  const videoSection = sections.get("梦境视频")?.trim();
  const videoUrl =
    videoSection && /^https?:\/\//m.test(videoSection)
      ? videoSection.split(/\n/).find((l) => /^https?:\/\//.test(l.trim()))?.trim()
      : undefined;

  let sceneParts = sections.get("场景")?.trim() ? parseScenesSection(sections.get("场景")!) : [];

  if (sceneParts.length === 0 && rawText.trim()) {
    sceneParts = [
      {
        scene: { id: "scene_1", description: rawText.slice(0, 4000) },
        prompt: "",
      },
    ];
  }

  if (sceneParts.length === 0 && !rawText.trim()) {
    throw new Error("dream.md 中缺少「原始口述」或「场景」，无法导入");
  }

  const structuredScenes: Scene[] = sceneParts.map((p) => p.scene);
  const promptsByIndex = sceneParts.map((p) => p.prompt);

  const characters = sections.get("人物") ? parseCharactersSection(sections.get("人物")!) : [];
  const emotions = sections.get("情绪") ? parseEmotionsSection(sections.get("情绪")!) : [];
  const anomalies = sections.get("异常") ? parseAnomaliesSection(sections.get("异常")!) : [];

  const structured: DreamStructured = {
    scenes: structuredScenes,
    characters,
    narrative: { events: [], summary: narrativeSummary },
    emotions,
    sensory: {},
    anomalies,
    meta: {},
    lowConfidence: [],
  };

  const dreamScenes: Dream["scenes"] = [];
  const sceneRenderPrompts: NonNullable<Dream["sceneRenderPrompts"]> = [];

  for (let i = 0; i < structuredScenes.length; i++) {
    const pngName = `scene-${i + 1}.png`;
    const png = findZipEntry(zip, pngName);
    let imageUrl = "";
    if (png) {
      const b64 = await png.async("base64");
      imageUrl = `data:image/png;base64,${b64}`;
    }
    const prompt = promptsByIndex[i] ?? "";
    dreamScenes.push({
      id: uuidv4(),
      sceneIndex: i,
      imageUrl,
      promptUsed: prompt,
      isSelected: false,
    });
    if (prompt) {
      sceneRenderPrompts.push({ sceneIndex: i, prompts: [prompt] });
    }
  }

  if (dreamScenes.length > 0) {
    const pick = dreamScenes.findIndex((s) => s.imageUrl);
    const sel = pick >= 0 ? pick : 0;
    for (let j = 0; j < dreamScenes.length; j++) {
      dreamScenes[j] = { ...dreamScenes[j], isSelected: j === sel };
    }
  }

  const dream: Dream = {
    id: uuidv4(),
    title,
    rawText,
    structured,
    scenes: dreamScenes,
    sceneRenderPrompts: sceneRenderPrompts.length ? sceneRenderPrompts : undefined,
    videoUrl,
    aiInterpretation,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  return dream;
}
