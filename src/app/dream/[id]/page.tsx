"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Moon,
  ArrowLeft,
  MapPin,
  Users,
  Heart,
  Sparkles,
  Download,
  RefreshCw,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ImageOff,
  Wand2,
  Video,
  Play,
} from "lucide-react";
import type { Dream, DreamSceneImage } from "@/types/dream";
import {
  DEFAULT_SCENE_IMAGE_MODEL,
  SCENE_IMAGE_MODEL_OPTIONS,
  type SceneImageModelId,
} from "@/lib/scene-image-model";
import JSZip from "jszip";
import AudioPlayer from "@/components/AudioPlayer";

type SceneImageApiRow = {
  sceneIndex: number;
  imageUrl: string;
  prompt: string;
  error?: string;
};

function mergeSceneResults(
  existing: DreamSceneImage[],
  incoming: SceneImageApiRow[]
): DreamSceneImage[] {
  const map = new Map<number, DreamSceneImage>();
  for (const s of existing) map.set(s.sceneIndex, { ...s });
  for (const img of incoming) {
    const prev = map.get(img.sceneIndex);
    map.set(img.sceneIndex, {
      id: prev?.id ?? crypto.randomUUID(),
      sceneIndex: img.sceneIndex,
      imageUrl: img.imageUrl,
      promptUsed: img.prompt,
      error: img.error,
      isSelected: prev?.isSelected ?? false,
    });
  }
  const list = Array.from(map.values()).sort((a, b) => a.sceneIndex - b.sceneIndex);
  if (list.length > 0 && !list.some((s) => s.isSelected))
    list[0] = { ...list[0], isSelected: true };
  return list;
}

function initDrafts(dream: Dream): Record<number, string> {
  const drafts: Record<number, string> = {};
  for (let i = 0; i < dream.structured.scenes.length; i++) {
    const rp = dream.sceneRenderPrompts?.find((p) => p.sceneIndex === i);
    const row = dream.scenes.find((s) => s.sceneIndex === i);
    drafts[i] = (rp?.prompts?.[0] ?? row?.promptUsed ?? "").trim();
  }
  return drafts;
}

/** 默认 ZIP 名：dream_{YYYYMMDD}_{标题}.zip */
function dreamZipFilename(dream: Dream): string {
  const d = new Date(dream.createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const datePart = `${y}${m}${day}`;
  const rawTitle = (dream.title || "未命名").trim() || "未命名";
  const safeTitle = rawTitle
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `dream_${datePart}_${safeTitle}.zip`;
}

export default function DreamDetailPage() {
  const params = useParams();
  const router = useRouter();

  const [dream, setDream] = useState<Dream | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // title
  const [retitling, setRetitling] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // prompt editing
  const [promptDrafts, setPromptDrafts] = useState<Record<number, string>>({});
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null);
  const [dirtyPrompts, setDirtyPrompts] = useState<Set<number>>(new Set());

  // regen state
  const [savingAll, setSavingAll] = useState(false);
  const [regenAll, setRegenAll] = useState(false);
  const [regenScenes, setRegenScenes] = useState<Set<number>>(new Set());
  const [sceneImageModel, setSceneImageModel] = useState<SceneImageModelId>(DEFAULT_SCENE_IMAGE_MODEL);

  // video generation
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const fetchDream = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/dreams/${id}`);
      if (res.ok) {
        const data = (await res.json()) as Dream;
        setDream(data);
        setPromptDrafts(initDrafts(data));
      }
    } catch (e) {
      console.error("Fetch dream error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (params.id) {
      setIsLoading(true);
      fetchDream(params.id as string);
    }
  }, [params.id, fetchDream]);

  // persist dream (scenes + prompts) to API
  const persistDream = useCallback(
    async (updatedDream: Dream) => {
      try {
        await fetch(`/api/dreams/${updatedDream.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: updatedDream.scenes,
            sceneRenderPrompts: updatedDream.sceneRenderPrompts,
          }),
        });
      } catch (e) {
        console.error("Persist dream error:", e);
      }
    },
    []
  );

  // save edited prompts only
  const handleSavePrompts = async () => {
    if (!dream || dirtyPrompts.size === 0) return;
    setSavingAll(true);
    try {
      const merged = (dream.sceneRenderPrompts ?? []).map((rp) => ({ ...rp }));
      for (const idx of dirtyPrompts) {
        const existing = merged.find((p) => p.sceneIndex === idx);
        const draft = (promptDrafts[idx] ?? "").trim();
        if (existing) existing.prompts = [draft, ...existing.prompts.slice(1)];
        else merged.push({ sceneIndex: idx, prompts: [draft] });
      }
      merged.sort((a, b) => a.sceneIndex - b.sceneIndex);

      // also update promptUsed in scenes
      const newScenes = dream.scenes.map((s) => {
        if (!dirtyPrompts.has(s.sceneIndex)) return s;
        return { ...s, promptUsed: (promptDrafts[s.sceneIndex] ?? "").trim() };
      });

      const updated: Dream = {
        ...dream,
        sceneRenderPrompts: merged,
        scenes: newScenes,
      };
      setDream(updated);
      setDirtyPrompts(new Set());
      await persistDream(updated);
    } finally {
      setSavingAll(false);
    }
  };

  // regen single scene
  const handleRegenScene = async (sceneIndex: number) => {
    if (!dream) return;
    const prompt = (promptDrafts[sceneIndex] ?? "").trim();
    if (!prompt) return;
    setRegenScenes((prev) => new Set(prev).add(sceneIndex));
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dreamStructured: dream.structured,
          phase: "images",
          scenePrompts: [{ sceneIndex, prompts: [prompt] }],
          imageModel: sceneImageModel,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { sceneImages?: SceneImageApiRow[] };
      if (result.sceneImages) {
        const newScenes = mergeSceneResults(dream.scenes, result.sceneImages);
        // update sceneRenderPrompts too
        const existing = (dream.sceneRenderPrompts ?? []).map((rp) => ({ ...rp }));
        const rpIdx = existing.findIndex((p) => p.sceneIndex === sceneIndex);
        if (rpIdx >= 0) existing[rpIdx].prompts = [prompt, ...existing[rpIdx].prompts.slice(1)];
        else existing.push({ sceneIndex, prompts: [prompt] });
        existing.sort((a, b) => a.sceneIndex - b.sceneIndex);

        const updated: Dream = { ...dream, scenes: newScenes, sceneRenderPrompts: existing };
        setDream(updated);
        setDirtyPrompts((prev) => { const n = new Set(prev); n.delete(sceneIndex); return n; });
        await persistDream(updated);
      }
    } catch (e) {
      console.error(`Regen scene ${sceneIndex} error:`, e);
    } finally {
      setRegenScenes((prev) => { const n = new Set(prev); n.delete(sceneIndex); return n; });
    }
  };

  // regen all failed or all scenes
  const handleRegenAll = async () => {
    if (!dream) return;
    setRegenAll(true);
    try {
      const scenePrompts = dream.structured.scenes
        .map((_, i) => {
          const rp = dream.sceneRenderPrompts?.find((p) => p.sceneIndex === i);
          const row = dream.scenes.find((s) => s.sceneIndex === i);
          const prompt = (promptDrafts[i] ?? rp?.prompts?.[0] ?? row?.promptUsed ?? "").trim();
          return prompt ? { sceneIndex: i, prompts: [prompt] } : null;
        })
        .filter((x): x is { sceneIndex: number; prompts: string[] } => x !== null);

      if (scenePrompts.length === 0) return;

      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dreamStructured: dream.structured,
          phase: "images",
          scenePrompts,
          imageModel: sceneImageModel,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { sceneImages?: SceneImageApiRow[] };
      if (result.sceneImages) {
        const newScenes = mergeSceneResults(dream.scenes, result.sceneImages);
        // refresh all prompts
        const existing = scenePrompts.map((sp) => ({
          sceneIndex: sp.sceneIndex,
          prompts: sp.prompts,
        }));
        const updated: Dream = { ...dream, scenes: newScenes, sceneRenderPrompts: existing };
        setDream(updated);
        setDirtyPrompts(new Set());
        await persistDream(updated);
      }
    } catch (e) {
      console.error("Regen all error:", e);
    } finally {
      setRegenAll(false);
    }
  };

  const handleRetitleDream = async () => {
    if (!dream || retitling) return;
    setRetitling(true);
    try {
      const res = await fetch("/api/dreams/retitle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dreamId: dream.id }),
      });
      if (res.ok) {
        const { results } = await res.json() as { results: { id: string; newTitle: string; ok: boolean }[] };
        const hit = results.find((r) => r.id === dream.id && r.ok);
        if (hit) setDream((prev) => prev ? { ...prev, title: hit.newTitle } : prev);
      }
    } catch (e) {
      console.error("Retitle error:", e);
    } finally {
      setRetitling(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!dream || generatingVideo) return;
    setGeneratingVideo(true);
    setVideoError(null);
    try {
      const sceneImageUrls = dream.scenes
        .filter((s) => s.imageUrl)
        .sort((a, b) => a.sceneIndex - b.sceneIndex)
        .map((s) => s.imageUrl);

      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneImageUrls, dreamStructured: dream.structured }),
      });
      const result = await res.json() as {
        status?: string;
        videoUrl?: string;
        message?: string;
        detail?: string;
      };

      if (result.videoUrl) {
        // persist to dreams.json
        await fetch(`/api/dreams/${dream.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: result.videoUrl }),
        });
        setDream((prev) => prev ? { ...prev, videoUrl: result.videoUrl } : prev);
      } else {
        setVideoError(result.message ?? result.detail ?? "视频生成失败");
      }
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setGeneratingVideo(false);
    }
  };

  const startEditTitle = () => {
    if (!dream) return;
    setTitleDraft(dream.title);
    setEditingTitle(true);
  };

  const commitTitleEdit = async () => {
    if (!dream) return;
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === dream.title) return;
    setDream((prev) => prev ? { ...prev, title: trimmed } : prev);
    try {
      await fetch(`/api/dreams/${dream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch (e) {
      console.error("Save title error:", e);
    }
  };

  const cancelTitleEdit = () => setEditingTitle(false);

  const handleExportMarkdown = async () => {
    if (!dream) return;

    const md = `# ${dream.title}

**日期**: ${new Date(dream.createdAt).toLocaleDateString("zh-CN")}

## 原始口述

${dream.rawText}

## 场景

${dream.structured.scenes
  .map((s, i) => {
    let sceneMd = `### 场景 ${i + 1}\n${s.description}`;
    const rp = dream.sceneRenderPrompts?.find((p) => p.sceneIndex === i);
    const row = dream.scenes.find((sc) => sc.sceneIndex === i);
    const ptext = rp?.prompts?.[0] ?? row?.promptUsed;
    if (ptext) sceneMd += `\n\n**生图 prompt**：\n\n\`\`\`\n${ptext}\n\`\`\``;
    if (s.lighting) sceneMd += `\n光线: ${s.lighting}`;
    if (s.colorTone) sceneMd += `\n色调: ${s.colorTone}`;
    if (s.weather) sceneMd += `\n天气: ${s.weather}`;
    if (s.spatialLayout) sceneMd += `\n空间布局: ${s.spatialLayout}`;
    const sceneImage = dream.scenes.find((sc) => sc.sceneIndex === i && sc.imageUrl);
    if (sceneImage) {
      const imgFilename = `scene-${i + 1}.png`;
      sceneMd += `\n![场景 ${i + 1}](${imgFilename})`;
    }
    return sceneMd;
  })
  .join("\n\n")}

## 人物

${dream.structured.characters
  .map(
    (c) =>
      `- **${c.identity}**${c.appearance ? `: ${c.appearance}` : ""}${c.relationship ? ` (${c.relationship})` : ""}`
  )
  .join("\n")}

## 叙事

${dream.structured.narrative.summary}

## 情绪

${dream.structured.emotions
  .map((e) => `- ${e.type} (强度: ${e.intensity}/10)${e.trigger ? ` — 触发: ${e.trigger}` : ""}`)
  .join("\n")}

## 异常

${dream.structured.anomalies.map((a) => `- ${a.description} [${a.type}]`).join("\n")}
`;

    const zip = new JSZip();
    zip.file("dream.md", md);
    const imagesWithDataUrl = dream.scenes.filter(
      (s) => s.imageUrl && s.imageUrl.startsWith("data:image")
    );
    for (const scene of imagesWithDataUrl) {
      const base64Data = scene.imageUrl.split(",")[1];
      zip.file(`scene-${scene.sceneIndex + 1}.png`, base64Data, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dreamZipFilename(dream);
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── loading / not-found ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!dream) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40">梦境未找到</p>
      </div>
    );
  }

  const { structured } = dream;
  const failedScenes = dream.structured.scenes.filter((_, i) => {
    const row = dream.scenes.find((s) => s.sceneIndex === i);
    return !row || !row.imageUrl;
  });
  const anyFailed = failedScenes.length > 0;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <Moon className="text-indigo-400 flex-shrink-0" size={20} />
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitleEdit();
                if (e.key === "Escape") cancelTitleEdit();
              }}
              className="text-lg font-semibold bg-transparent border-b border-indigo-400 text-white/90 outline-none w-48 min-w-0"
            />
          ) : (
            <h1
              onClick={startEditTitle}
              title="点击编辑标题"
              className="text-lg font-semibold text-white/90 cursor-text hover:text-white transition-colors truncate max-w-[240px]"
            >
              {dream.title}
            </h1>
          )}
          <button
            onClick={handleRetitleDream}
            disabled={retitling || editingTitle}
            title="AI 重新生成标题"
            className="flex-shrink-0 w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-40"
          >
            {retitling ? (
              <Loader2 size={13} className="animate-spin text-indigo-400" />
            ) : (
              <Wand2 size={13} className="text-white/30 hover:text-indigo-300" />
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportMarkdown}
            title="导出 ZIP"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full space-y-10">
        <div className="text-sm text-white/30">
          {new Date(dream.createdAt).toLocaleString("zh-CN")}
        </div>

        {dream.audioFileName && (
          <AudioPlayer src={`/api/audio/${dream.audioFileName}`} label="梦境录音" />
        )}

        {/* ── 场景 + 生图 ── */}
        {structured.scenes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-medium text-white/50 flex items-center gap-2">
                <MapPin size={14} />
                场景 &amp; 生图
              </h2>
              <div className="flex items-center gap-2">
                {dirtyPrompts.size > 0 && (
                  <button
                    onClick={handleSavePrompts}
                    disabled={savingAll}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-50"
                  >
                    {savingAll ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    保存 Prompt
                  </button>
                )}
                <button
                  onClick={handleRegenAll}
                  disabled={regenAll}
                  title={anyFailed ? "重新生成失败的场景图" : "重新生成所有场景图"}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 border border-white/10 transition-colors disabled:opacity-50"
                >
                  {regenAll ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {anyFailed ? `重新生成 (${failedScenes.length} 失败)` : "重新生成全部"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
              <span className="text-white/35">生图模型</span>
              <select
                value={sceneImageModel}
                onChange={(e) => setSceneImageModel(e.target.value as SceneImageModelId)}
                disabled={regenAll || regenScenes.size > 0}
                className="bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50"
              >
                {SCENE_IMAGE_MODEL_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#12121a]">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-5">
              {structured.scenes.map((scene, i) => {
                const row = dream.scenes.find((s) => s.sceneIndex === i);
                const hasImage = Boolean(row?.imageUrl);
                const hasFailed = !hasImage;
                const isRegening = regenScenes.has(i);
                const draft = promptDrafts[i] ?? "";
                const isDirty = dirtyPrompts.has(i);
                const isExpanded = expandedPrompt === i;

                return (
                  <div
                    key={scene.id}
                    className={`rounded-xl border transition-colors ${
                      hasFailed
                        ? "bg-rose-500/5 border-rose-500/20"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    {/* scene image / placeholder */}
                    {hasImage ? (
                      <div className="w-full aspect-video rounded-t-xl overflow-hidden">
                        <img
                          src={row!.imageUrl}
                          alt={`场景 ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full aspect-video rounded-t-xl bg-white/[0.03] flex flex-col items-center justify-center gap-2 border-b border-white/5">
                        {isRegening ? (
                          <>
                            <Loader2 size={24} className="text-indigo-400 animate-spin" />
                            <p className="text-xs text-white/30">生成中…</p>
                          </>
                        ) : (
                          <>
                            <ImageOff size={24} className="text-white/20" />
                            <p className="text-xs text-white/30">暂无图片</p>
                            {row?.error && (
                              <p className="text-xs text-rose-400/60 px-6 text-center line-clamp-2">
                                {row.error}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* scene meta */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-semibold text-white/50 mb-1">
                            场景 {i + 1}
                            {hasFailed && (
                              <span className="ml-2 text-rose-400 inline-flex items-center gap-0.5">
                                <AlertCircle size={10} />
                                生图失败
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-white/70 leading-relaxed">{scene.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {scene.lighting && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300">
                                光线: {scene.lighting}
                              </span>
                            )}
                            {scene.colorTone && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300">
                                色调: {scene.colorTone}
                              </span>
                            )}
                            {scene.weather && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300">
                                天气: {scene.weather}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* regen single btn */}
                        <button
                          onClick={() => handleRegenScene(i)}
                          disabled={isRegening || regenAll}
                          title="重新生成此场景图"
                          className="flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/25 transition-colors disabled:opacity-40 mt-0.5"
                        >
                          {isRegening ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <RefreshCw size={11} />
                          )}
                          重新生成
                        </button>
                      </div>

                      {/* prompt section */}
                      <div className="border-t border-white/5 pt-3">
                        <button
                          onClick={() => setExpandedPrompt(isExpanded ? null : i)}
                          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-2"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          生图 Prompt
                          {draft && (
                            <span className="text-white/20">
                              — {draft.slice(0, 40)}{draft.length > 40 ? "…" : ""}
                            </span>
                          )}
                          {isDirty && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="space-y-2">
                            <textarea
                              value={draft}
                              onChange={(e) => {
                                setPromptDrafts((prev) => ({ ...prev, [i]: e.target.value }));
                                setDirtyPrompts((prev) => new Set(prev).add(i));
                              }}
                              rows={4}
                              placeholder="在此输入或修改生图 prompt…"
                              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 placeholder-white/20 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07] transition-colors font-mono leading-relaxed"
                            />
                            <div className="flex justify-end gap-2">
                              {isDirty && (
                                <button
                                  onClick={handleSavePrompts}
                                  disabled={savingAll}
                                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-50"
                                >
                                  {savingAll ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : (
                                    <Save size={11} />
                                  )}
                                  保存
                                </button>
                              )}
                              <button
                                onClick={() => handleRegenScene(i)}
                                disabled={isRegening || regenAll || !draft.trim()}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 border border-white/10 transition-colors disabled:opacity-40"
                              >
                                {isRegening ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <RefreshCw size={11} />
                                )}
                                以此 Prompt 生图
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 视频 ── */}
        <section>
          <h2 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
            <Video size={14} />
            梦境视频
          </h2>

          {dream.videoUrl ? (
            <video
              src={dream.videoUrl}
              controls
              className="w-full rounded-xl overflow-hidden bg-black"
            />
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              {/* 场景图预览行 */}
              {dream.scenes.filter((s) => s.imageUrl).length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dream.scenes
                    .filter((s) => s.imageUrl)
                    .sort((a, b) => a.sceneIndex - b.sceneIndex)
                    .map((s) => (
                      <img
                        key={s.id}
                        src={s.imageUrl}
                        alt={`场景 ${s.sceneIndex + 1}`}
                        className="h-16 w-28 object-cover rounded-lg flex-shrink-0 opacity-70"
                      />
                    ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-white/40">
                  {dream.scenes.filter((s) => s.imageUrl).length > 0
                    ? "以现有场景图为参考，生成梦境视频（约需数分钟）"
                    : "暂无场景图，将根据梦境文本生成视频（约需数分钟）"}
                </p>
                <button
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 text-sm transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {generatingVideo ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      生成中，请稍候…
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      生成梦境视频
                    </>
                  )}
                </button>
              </div>

              {generatingVideo && (
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  视频生成通常需要 2～10 分钟，请保持页面打开
                </div>
              )}

              {videoError && (
                <div className="flex items-start gap-2 text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/15 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{videoError}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 人物 ── */}
        {structured.characters.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
              <Users size={14} />
              人物
            </h2>
            <div className="flex flex-wrap gap-3">
              {structured.characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    const name = (char.name || "").trim();
                    const identity = (char.identity || "").trim();
                    if (!name && !identity) return;
                    fetch(`/api/persons`, { cache: "no-store" })
                      .then((r) => r.json())
                      .then((persons: { id: string; name: string }[]) => {
                        const match = persons.find((p) => {
                          const pn = p.name.toLowerCase();
                          return (
                            (name && pn === name.toLowerCase()) ||
                            (identity && pn === identity.toLowerCase())
                          );
                        });
                        if (match) router.push(`/person/${match.id}`);
                        else router.push("/persons");
                      })
                      .catch(() => router.push("/persons"));
                  }}
                  className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                >
                  <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                    {char.name || char.identity}
                    {char.name && char.name !== char.identity && (
                      <span className="text-xs text-white/30 ml-2">{char.identity}</span>
                    )}
                  </p>
                  {char.appearance && (
                    <p className="text-xs text-white/40 mt-1">{char.appearance}</p>
                  )}
                  {char.relationship && (
                    <p className="text-xs text-indigo-300 mt-1">{char.relationship}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── 叙事 ── */}
        <section>
          <h2 className="text-sm font-medium text-white/50 mb-4">叙事</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            {structured.narrative.summary}
          </p>
        </section>

        {/* ── 情绪 ── */}
        {structured.emotions.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
              <Heart size={14} />
              情绪轨迹
            </h2>
            <div className="space-y-2">
              {structured.emotions.map((emotion, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-white/60 w-20 flex-shrink-0">{emotion.type}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full"
                      style={{ width: `${(emotion.intensity / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/30 flex-shrink-0">{emotion.intensity}/10</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 异常 ── */}
        {structured.anomalies.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
              <Sparkles size={14} />
              异常元素
            </h2>
            <div className="space-y-2">
              {structured.anomalies.map((anomaly, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-amber-500/5 border border-amber-500/10 px-4 py-3"
                >
                  <p className="text-sm text-white/60">{anomaly.description}</p>
                  <span className="text-xs text-amber-300/60">{anomaly.type}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 原始口述 ── */}
        <section>
          <h2 className="text-sm font-medium text-white/50 mb-4">原始口述</h2>
          <p className="text-sm text-white/40 leading-relaxed whitespace-pre-wrap">
            {dream.rawText}
          </p>
        </section>
      </main>
    </div>
  );
}
