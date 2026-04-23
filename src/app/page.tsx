"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, BookOpen, Loader2, ArrowRight, SkipForward, Sparkles, Copy, Check, Film, ChevronDown, Users, Wand2, Upload, Info } from "lucide-react";
import DreamHeroHeadline from "@/components/DreamHeroHeadline";
import VoiceRecorder from "@/components/VoiceRecorder";
import ProbeChat from "@/components/ProbeChat";
import AudioPlayer from "@/components/AudioPlayer";
import { useDreamStore } from "@/stores/dream-store";
import type { Dream, DreamFlowStep, ProbeMessage } from "@/types/dream";
import { messageFromErrorResponse } from "@/lib/llm-utils";
import {
  DEFAULT_SCENE_IMAGE_MODEL,
  SCENE_IMAGE_MODEL_OPTIONS,
  type SceneImageModelId,
} from "@/lib/scene-image-model";
import Link from "next/link";

/** Client-visible keys only via NEXT_PUBLIC_* — set in `.env.local`, never commit secrets. */
function publicEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const MODEL_OPTIONS = [
  {
    value: "gpt-5.4-mini",
    label: "GPT 5.4 Mini",
    apiUrl: publicEnv("NEXT_PUBLIC_LLM_OPENCLAUDECODE_URL") || "https://www.openclaudecode.cn/v1",
    apiKey: publicEnv("NEXT_PUBLIC_LLM_OPENCLAUDECODE_KEY_GPT"),
  },
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    apiUrl: publicEnv("NEXT_PUBLIC_LLM_OPENCLAUDECODE_URL") || "https://www.openclaudecode.cn/v1",
    apiKey: publicEnv("NEXT_PUBLIC_LLM_OPENCLAUDECODE_KEY_CLAUDE"),
  },
  {
    value: "doubao-seed-2-0-mini-260215",
    label: "Doubao Seed 2.0 Mini",
    apiUrl: publicEnv("NEXT_PUBLIC_LLM_DOUBAO_URL") || "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: publicEnv("NEXT_PUBLIC_LLM_DOUBAO_KEY"),
  },
];

const STEP_LABELS: Record<DreamFlowStep, string> = {
  recording: "口述梦境",
  transcribing: "语音转写",
  polishing: "文本润色",
  parsing: "结构化提取",
  probing: "记忆补全",
  rendering: "场景生图",
  video: "梦境视频",
  complete: "记录完成",
};

interface ScenePrompt {
  sceneIndex: number;
  description: string;
  prompts: string[];
}

interface PolishMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

/** Prefer locally edited 润色稿 (`polishedText`), then latest assistant reply, then raw transcript. */
function getFinalPolishTextForParse(
  messages: PolishMessage[],
  polishedTextState: string,
  rawFallback: string
): string {
  if (polishedTextState.trim()) {
    return polishedTextState;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (m.content.startsWith("整理失败：")) continue;
    if (m.content.trim()) return m.content;
  }
  return rawFallback.trim();
}

/** So LLM follow-up sees manual edits in the textarea, not the last chat bubble only. */
function withDraftSyncedToPolishHistory(
  messages: PolishMessage[],
  draft: string
): PolishMessage[] {
  const next = messages.map((m) => ({ ...m }));
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === "assistant" && !next[i].content.startsWith("整理失败：")) {
      next[i] = { ...next[i], content: draft };
      break;
    }
  }
  return next;
}

const DEFAULT_LLM_MODEL = "gpt-5.4-mini";

function audioFilenameForBlob(blob: Blob): string {
  const t = (blob.type || "").toLowerCase();
  if (t.includes("ogg")) return "recording.ogg";
  if (t.includes("mpeg") || t.includes("mp3")) return "recording.mp3";
  if (t.includes("wav")) return "recording.wav";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "recording.m4a";
  return "recording.webm";
}

async function transcribeViaAsr(file: File | Blob, filename: string): Promise<{ text: string; audioFileName?: string }> {
  const formData = new FormData();
  formData.append("audio", file, filename);
  const response = await fetch("/api/asr", { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(await messageFromErrorResponse(response));
  }
  return response.json();
}

export default function Home() {
  const {
    currentStep, setCurrentStep,
    currentDream, setCurrentDream,
    probeMessages, addProbeMessage, setProbeMessages,
    rawText, setRawText,
    isProcessing, setIsProcessing,
    audioBlobUrl, setAudioBlobUrl,
    audioFileName, setAudioFileName,
    reset,
  } = useDreamStore();

  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(true);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [probeComplete, setProbeComplete] = useState(false);
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([]);
  const [sceneImages, setSceneImages] = useState<Array<{ sceneIndex: number; imageUrl: string; prompt: string; error?: string }>>([]);
  const [promptDraftsByScene, setPromptDraftsByScene] = useState<Record<number, string>>({});
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [isRenderingImages, setIsRenderingImages] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_LLM_MODEL);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Polish step states
  const [polishedText, setPolishedText] = useState("");
  const [polishMessages, setPolishMessages] = useState<PolishMessage[]>([]);
  const [polishInput, setPolishInput] = useState("");
  const [isPolishing, setIsPolishing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sceneImageModel, setSceneImageModel] = useState<SceneImageModelId>(DEFAULT_SCENE_IMAGE_MODEL);

  const selectedModelConfig = MODEL_OPTIONS.find(m => m.value === selectedModel) || MODEL_OPTIONS[0];

  const confirmedPolishText = useMemo(
    () => getFinalPolishTextForParse(polishMessages, polishedText, rawText).trim(),
    [polishMessages, polishedText, rawText]
  );

  const modelHeaders = (extra?: Record<string, string>) => ({
    "Content-Type": "application/json",
    "x-model": selectedModelConfig.value,
    "x-api-url": selectedModelConfig.apiUrl,
    "x-api-key": selectedModelConfig.apiKey,
    ...extra,
  });

  const handleRecordingComplete = useCallback(
    async (audioBlob: Blob, duration: number, browserTranscript: string) => {
      const blobUrl = URL.createObjectURL(audioBlob);
      setAudioBlobUrl(blobUrl);
      setIsProcessing(true);
      setCurrentStep("transcribing");

      try {
        let text = browserTranscript;

        if (!text.trim()) {
          const data = await transcribeViaAsr(audioBlob, audioFilenameForBlob(audioBlob));
          text = data.text;
          if (data.audioFileName) {
            setAudioFileName(data.audioFileName);
            URL.revokeObjectURL(blobUrl);
            setAudioBlobUrl(`/api/audio/${data.audioFileName}`);
          }
        } else {
          transcribeViaAsr(audioBlob, audioFilenameForBlob(audioBlob))
            .then((data) => {
              if (data.audioFileName) {
                setAudioFileName(data.audioFileName);
                setAudioBlobUrl(`/api/audio/${data.audioFileName}`);
              }
            })
            .catch(() => {});
        }

        setRawText(text);
        setCurrentStep("polishing");
        setIsProcessing(false);

        // Auto-start polish
        await startPolish(text);
      } catch (error) {
        console.error("Processing error:", error);
        setShowTextInput(true);
        setIsProcessing(false);
      }
    },
    [setAudioBlobUrl, setAudioFileName]
  );

  const handleTextInput = useCallback(async () => {
    if (!textInput.trim()) return;
    setRawText(textInput);
    setCurrentStep("polishing");

    // Auto-start polish
    await startPolish(textInput);
  }, [textInput]);

  const startPolish = async (text: string) => {
    setIsPolishing(true);
    try {
      const response = await fetch("/api/polish", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ rawText: text }),
      });
      if (!response.ok) {
        throw new Error(await messageFromErrorResponse(response));
      }
      const data = await response.json();

      const assistantMessage: PolishMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.polishedText,
      };
      setPolishedText(data.polishedText);
      setPolishMessages([
        { id: crypto.randomUUID(), role: "system", content: "以下是整理后的梦境文本，你可以继续提出修改意见。" },
        assistantMessage,
      ]);
    } catch (error) {
      console.error("Polish error:", error);
      const reason = error instanceof Error ? error.message : "未知错误";
      setPolishedText(text);
      setPolishMessages([
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `文本整理失败：${reason}。已使用原始文本，你可编辑后继续；若与密钥或服务商有关，请更换顶部模型或配置环境变量。`,
        },
        { id: crypto.randomUUID(), role: "assistant", content: text },
      ]);
    } finally {
      setIsPolishing(false);
    }
  };

  async function handleUploadedAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAudioBlobUrl(previewUrl);
    setAudioFileName("");
    setIsProcessing(true);
    setCurrentStep("transcribing");
    try {
      const name =
        file.name && !file.name.startsWith("blob") ? file.name : audioFilenameForBlob(file);
      const data = await transcribeViaAsr(file, name);
      const text = (data.text ?? "").trim();
      if (data.audioFileName) {
        setAudioFileName(data.audioFileName);
        URL.revokeObjectURL(previewUrl);
        setAudioBlobUrl(`/api/audio/${data.audioFileName}`);
      }
      setRawText(text);
      setCurrentStep("polishing");
      setIsProcessing(false);
      if (text) {
        await startPolish(text);
      } else {
        setPolishedText("");
        setPolishMessages([]);
      }
    } catch (err) {
      console.error("Upload ASR error:", err);
      URL.revokeObjectURL(previewUrl);
      setAudioBlobUrl("");
      setIsProcessing(false);
      setCurrentStep("recording");
    }
  }

  function handleGoToPolishRawOnly() {
    const t = textInput.trim();
    if (!t) return;
    setRawText(t);
    setCurrentStep("polishing");
    setPolishedText(t);
    setPolishMessages([
      {
        id: crypto.randomUUID(),
        role: "system",
        content: "已保留原文。可在下方润色稿中直接修改，有空再点「修改」调用 AI；或直接确认进入下一步。",
      },
      { id: crypto.randomUUID(), role: "assistant", content: t },
    ]);
  }

  const handlePolishRequest = async () => {
    if (!polishInput.trim() || !rawText) return;

    const userMessage: PolishMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: polishInput,
    };
    const historySynced = withDraftSyncedToPolishHistory(polishMessages, polishedText);
    const updatedMessages = [...historySynced, userMessage];
    setPolishMessages(updatedMessages);
    setPolishInput("");
    setIsPolishing(true);

    try {
      const response = await fetch("/api/polish", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({
          rawText,
          conversationHistory: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          userRequest: polishInput,
        }),
      });
      if (!response.ok) {
        throw new Error(await messageFromErrorResponse(response));
      }
      const data = await response.json();

      const assistantMessage: PolishMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.polishedText,
      };
      setPolishedText(data.polishedText);
      setPolishMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      console.error("Polish request error:", error);
      const msg = error instanceof Error ? error.message : "未知错误";
      setPolishMessages([
        ...updatedMessages,
        { id: crypto.randomUUID(), role: "assistant", content: `整理失败：${msg}` },
      ]);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleConfirmPolish = async () => {
    const textToParse = confirmedPolishText;
    if (!textToParse) return;

    setRawText(textToParse);
    setParseError(null);

    setIsProcessing(true);
    setCurrentStep("parsing");

    try {
      const parseResponse = await fetch("/api/parse", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ text: textToParse }),
      });
      if (!parseResponse.ok) {
        const msg = await messageFromErrorResponse(parseResponse);
        setParseError(msg);
        setCurrentStep("polishing");
        return;
      }
      const parseData = await parseResponse.json() as { title?: string } & Dream["structured"];
      // parse API returns { title, ...DreamStructured }; strip title before using as structured
      const { title: llmTitle, ...structured } = parseData;

      const dream: Dream = {
        id: crypto.randomUUID(),
        title: llmTitle?.trim() || (structured as Dream["structured"]).narrative?.summary?.slice(0, 20) || "未命名梦境",
        rawText: textToParse, structured: structured as Dream["structured"], scenes: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      setCurrentDream(dream);
      setCurrentStep("probing");

      const initialMessage: ProbeMessage = {
        id: crypto.randomUUID(), dreamId: dream.id, role: "system",
        content: "梦境结构化完成，开始交互式记忆补全...",
        createdAt: new Date().toISOString(),
      };
      setProbeMessages([initialMessage]);
      await startProbing(dream, [initialMessage]);
    } catch (error) {
      console.error("Parse error:", error);
      const msg = error instanceof Error ? error.message : "未知错误";
      setParseError(msg);
      setCurrentStep("polishing");
    } finally {
      setIsProcessing(false);
    }
  };

  const startProbing = async (dream: Dream, messages: ProbeMessage[]) => {
    setIsProcessing(true);
    try {
      const conversationHistory = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      const response = await fetch("/api/probe", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ dreamStructured: dream.structured, conversationHistory }),
      });
      if (!response.ok) throw new Error("Probe failed");
      const result = await response.json();

      if (result.action === "ask") {
        addProbeMessage({ id: crypto.randomUUID(), dreamId: dream.id, role: "assistant", content: result.question, createdAt: new Date().toISOString() });
      } else if (result.action === "complete") {
        setProbeComplete(true);
        if (result.updatedDream) setCurrentDream({ ...dream, structured: result.updatedDream });
      }
    } catch (error) {
      console.error("Probe error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProbeAnswer = useCallback(
    async (content: string, _isVoice: boolean) => {
      if (!currentDream) return;
      const userMessage: ProbeMessage = { id: crypto.randomUUID(), dreamId: currentDream.id, role: "user", content, createdAt: new Date().toISOString() };
      addProbeMessage(userMessage);
      setIsProcessing(true);

      try {
        const allMessages = [...probeMessages, userMessage];
        const conversationHistory = allMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
        const response = await fetch("/api/probe", {
          method: "POST",
          headers: modelHeaders(),
          body: JSON.stringify({ dreamStructured: currentDream.structured, conversationHistory, userAnswer: content }),
        });
        if (!response.ok) throw new Error("Probe failed");
        const result = await response.json();

        if (result.action === "ask") {
          addProbeMessage({ id: crypto.randomUUID(), dreamId: currentDream.id, role: "assistant", content: result.question, createdAt: new Date().toISOString() });
        } else if (result.action === "complete") {
          setProbeComplete(true);
          if (result.updatedDream) setCurrentDream({ ...currentDream, structured: result.updatedDream });
        }
      } catch (error) {
        console.error("Probe answer error:", error);
      } finally {
        setIsProcessing(false);
      }
    },
    [currentDream, probeMessages]
  );

  const handleSkipProbe = () => setProbeComplete(true);

  const handleGeneratePrompts = async () => {
    if (!currentDream) return;
    setCurrentStep("rendering");
    setSceneImages([]);
    setIsLoadingPrompts(true);

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ dreamStructured: currentDream.structured, phase: "prompts" }),
      });
      if (!response.ok) {
        throw new Error(await messageFromErrorResponse(response));
      }
      const result = await response.json();

      if (result.scenePrompts) {
        const mapped = result.scenePrompts.map((sp: { sceneIndex: number; prompts: string[] }) => ({
          sceneIndex: sp.sceneIndex,
          description: currentDream!.structured.scenes?.[sp.sceneIndex]?.description || `场景 ${sp.sceneIndex + 1}`,
          prompts: sp.prompts,
        }));
        setScenePrompts(mapped);
        const drafts: Record<number, string> = {};
        for (const sp of mapped) {
          drafts[sp.sceneIndex] = sp.prompts[0] || "";
        }
        setPromptDraftsByScene(drafts);
      }
    } catch (error) {
      console.error("Render error:", error);
    } finally {
      setIsLoadingPrompts(false);
    }
  };

  const handleGenerateSceneImages = async () => {
    if (!currentDream || scenePrompts.length === 0) return;
    const invalid = scenePrompts.some((sp) => !(promptDraftsByScene[sp.sceneIndex] ?? sp.prompts[0])?.trim());
    if (invalid) return;

    setIsRenderingImages(true);
    try {
      const edited = scenePrompts.map((sp) => ({
        sceneIndex: sp.sceneIndex,
        prompts: [
          (promptDraftsByScene[sp.sceneIndex] ?? sp.prompts[0] ?? "").trim(),
          ...sp.prompts.slice(1),
        ],
      }));
      const response = await fetch("/api/render", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({
          dreamStructured: currentDream.structured,
          phase: "images",
          scenePrompts: edited,
          imageModel: sceneImageModel,
        }),
      });
      if (!response.ok) {
        throw new Error(await messageFromErrorResponse(response));
      }
      const result = await response.json();
      if (result.sceneImages) {
        setSceneImages(result.sceneImages);
      }
    } catch (error) {
      console.error("Scene images error:", error);
    } finally {
      setIsRenderingImages(false);
    }
  };

  const handleCopyPrompt = async (prompt: string, key: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedIndex(key);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleGenerateVideo = async () => {
    if (!currentDream) return;
    setCurrentStep("video");
    setIsGeneratingVideo(true);

    try {
      const sceneImageUrlsList = sceneImages.map((img) => img.imageUrl).filter(Boolean);
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneImageUrls: sceneImageUrlsList, dreamStructured: currentDream.structured }),
      });
      if (!response.ok) throw new Error("Video generation failed");
      const result = await response.json();

      if (result.videoPrompt) setVideoPrompt(result.videoPrompt);
      if (result.videoUrl) setVideoUrl(result.videoUrl);
    } catch (error) {
      console.error("Video generation error:", error);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleSaveDream = async () => {
    if (!currentDream) return;
    try {
      await fetch("/api/dreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentDream,
          audioFileName,
          sceneRenderPrompts: scenePrompts.map((sp) => ({
            sceneIndex: sp.sceneIndex,
            prompts: sp.prompts,
          })),
          scenes: sceneImages.map((img, i) => ({
            id: crypto.randomUUID(),
            sceneIndex: img.sceneIndex,
            imageUrl: img.imageUrl,
            promptUsed: img.prompt,
            error: img.error,
            isSelected: i === 0,
          })),
          videoUrl,
        }),
      });
    } catch (error) {
      console.error("Save error:", error);
    }
    setCurrentStep("complete");
  };

  const handleNewDream = () => {
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    reset();
    setTextInput(""); setShowTextInput(true); setProbeComplete(false);
    setScenePrompts([]); setSceneImages([]); setPromptDraftsByScene({});
    setIsLoadingPrompts(false); setIsRenderingImages(false);
    setVideoPrompt(""); setVideoUrl(""); setIsGeneratingVideo(false);
    setAudioFileName("");
    setPolishedText(""); setPolishMessages([]); setPolishInput("");
    setParseError(null);
  };

  const progress = (() => {
    const steps: DreamFlowStep[] = ["recording", "transcribing", "polishing", "parsing", "probing", "rendering", "video", "complete"];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Moon className="text-indigo-400" size={24} />
          <h1 className="text-lg font-semibold text-white/90">掬梦</h1>
          <span className="text-xs text-white/30">DreamCup AI</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              <span>{MODEL_OPTIONS.find(m => m.value === selectedModel)?.label || selectedModel}</span>
              <ChevronDown size={12} className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showModelDropdown && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-gray-900 border border-white/10 shadow-xl z-50 overflow-hidden">
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.value}
                    onClick={() => { setSelectedModel(model.value); setShowModelDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-white/10 transition-colors ${
                      selectedModel === model.value ? "text-indigo-400 bg-indigo-500/10" : "text-white/60"
                    }`}
                  >
                    <div>{model.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link href="/persons" className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
            <Users size={16} />
            人物库
          </Link>
          <Link href="/journal" className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
            <BookOpen size={16} />
            梦境日志
          </Link>
          <Link href="/about" className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors">
            <Info size={16} />
            关于
          </Link>
        </div>
      </header>

      <div className="px-6 py-2">
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
        </div>
        <div className="flex justify-between mt-1">
          {Object.entries(STEP_LABELS).map(([step, label]) => (
            <span key={step} className={`text-[10px] ${currentStep === step ? "text-indigo-400" : "text-white/20"}`}>{label}</span>
          ))}
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait">
          {currentStep === "recording" && (
            <motion.div key="recording" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-lg flex flex-col items-center">
              <DreamHeroHeadline />
              <p className="text-sm text-white/40 mb-2 text-center">刚醒时先记下来：口述、上传昨晚录音、或直接打字——都会进入润色与后续步骤</p>

              <div className="w-full flex flex-col sm:flex-row gap-2 mb-6">
                <label className="w-full flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/70 hover:bg-white/[0.07] transition-colors">
                  <Upload size={18} className="text-indigo-400 shrink-0" />
                  <span>上传录音转写（mp3 / wav / ogg / webm 等）</span>
                  <input
                    ref={audioFileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.opus,.aac"
                    className="hidden"
                    onChange={handleUploadedAudio}
                  />
                </label>
              </div>

              <VoiceRecorder onRecordingComplete={handleRecordingComplete} disabled={isProcessing} />

              <div className="mt-8 w-full border-t border-white/10 pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/45">文字速记（可跳过口述）</span>
                  <button type="button" onClick={() => setShowTextInput(!showTextInput)} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                    {showTextInput ? "收起" : "展开"}
                  </button>
                </div>
                {showTextInput && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="醒来先打几句碎片也行，有空再润色、补全…"
                      rows={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 resize-none"
                    />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleTextInput}
                        disabled={!textInput.trim()}
                        className="flex-1 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        进入润色并开始 AI 整理
                      </button>
                      <button
                        type="button"
                        onClick={handleGoToPolishRawOnly}
                        disabled={!textInput.trim()}
                        className="flex-1 py-2.5 rounded-lg border border-white/15 bg-white/[0.03] text-sm text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                      >
                        仅保留原文，稍后整理
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {currentStep === "transcribing" && (
            <motion.div key="transcribing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-lg flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-indigo-400" size={48} />
              <p className="text-white/60">正在将语音转写为文字...</p>
              {audioBlobUrl && <div className="w-full mt-2"><AudioPlayer src={audioBlobUrl} /></div>}
              {rawText && (
                <div className="w-full mt-2 rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-white/40 mb-2">转写文本</p>
                  <p className="text-sm text-white/60 whitespace-pre-wrap">{rawText}</p>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "polishing" && (
            <motion.div key="polishing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-white/80"><Wand2 size={18} className="inline mr-2 text-indigo-400" />文本润色</h2>
                <span className="text-xs text-white/30">让梦境描述更通顺，忠于原文</span>
              </div>
              {audioBlobUrl && <div className="mb-3"><AudioPlayer src={audioBlobUrl} /></div>}

              {rawText && (
                <div className="mb-3 rounded-xl bg-white/[0.02] border border-white/10 p-3">
                  <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wider">原始文本</p>
                  <p className="text-xs text-white/40 whitespace-pre-wrap line-clamp-3">{rawText}</p>
                </div>
              )}

              <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {polishMessages.length === 0 && isPolishing && (
                    <div className="flex items-center gap-2 text-white/30">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs">正在整理文本...</span>
                    </div>
                  )}
                  {polishMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "bg-indigo-500/20 text-white/80"
                          : msg.role === "system"
                          ? "bg-white/5 text-white/40 text-xs"
                          : "bg-white/[0.05] text-white/70 border border-white/10"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isPolishing && polishMessages.length > 0 && (
                    <div className="flex items-center gap-2 text-white/30">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs">正在修改...</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={polishInput}
                      onChange={(e) => setPolishInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePolishRequest()}
                      placeholder="提出修改意见，例如：把第三句删掉..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
                    />
                    <button
                      onClick={handlePolishRequest}
                      disabled={!polishInput.trim() || isPolishing}
                      className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm transition-colors disabled:opacity-50"
                    >
                      修改
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 shrink-0 flex flex-col gap-2 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">润色稿（可直接编辑）</p>
                  <span className="text-[10px] text-white/25">修改会实时用于「确认并进入结构化提取」</span>
                </div>
                <textarea
                  value={polishedText}
                  onChange={(e) => setPolishedText(e.target.value)}
                  disabled={isPolishing}
                  rows={6}
                  placeholder="模型生成后将显示在此，可直接增删改；小改动无需再点「修改」对话。"
                  className="w-full min-h-[7.5rem] max-h-[30vh] resize-y bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/85 placeholder:text-white/25 focus:outline-none focus:border-indigo-500/45 disabled:opacity-50 disabled:cursor-not-allowed whitespace-pre-wrap"
                />
              </div>

              {parseError && (
                <p className="w-full text-sm text-red-400/90 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2 whitespace-pre-wrap">
                  结构化提取失败：{parseError}
                </p>
              )}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                <button
                  onClick={handleConfirmPolish}
                  disabled={isPolishing || !confirmedPolishText}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  确认并进入结构化提取 <ArrowRight size={16} />
                </button>
              </motion.div>
            </motion.div>
          )}

          {currentStep === "parsing" && (
            <motion.div key="parsing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-lg flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-indigo-400" size={48} />
              <p className="text-white/60">正在提取梦境结构...</p>
              {audioBlobUrl && <div className="w-full mt-2"><AudioPlayer src={audioBlobUrl} /></div>}
              {rawText && (
                <div className="w-full mt-2 rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs text-white/40 mb-2">润色后的文本</p>
                  <p className="text-sm text-white/60 whitespace-pre-wrap">{rawText}</p>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "probing" && currentDream && (
            <motion.div key="probing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-white/80"><Sparkles size={18} className="inline mr-2 text-indigo-400" />记忆补全</h2>
                {!probeComplete && (
                  <button onClick={handleSkipProbe} className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors">
                    <SkipForward size={14} />跳过补全
                  </button>
                )}
              </div>
              {audioBlobUrl && <div className="mb-3"><AudioPlayer src={audioBlobUrl} /></div>}
              <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                <ProbeChat messages={probeMessages} onSendMessage={handleProbeAnswer} isProcessing={isProcessing} isComplete={probeComplete} />
              </div>
              {probeComplete && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                  <button onClick={handleGeneratePrompts}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all flex items-center justify-center gap-2">
                    生成场景提示词 <ArrowRight size={16} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentStep === "rendering" && (
            <motion.div key="rendering" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-3xl">
              <h2 className="text-lg font-medium text-white/80 mb-4"><Sparkles size={18} className="inline mr-2 text-indigo-400" />场景生图</h2>
              {audioBlobUrl && <div className="mb-4"><AudioPlayer src={audioBlobUrl} /></div>}

              {isLoadingPrompts ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 className="animate-spin text-indigo-400" size={40} />
                  <p className="text-white/50">正在生成场景提示词...</p>
                </div>
              ) : isRenderingImages ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 className="animate-spin text-indigo-400" size={40} />
                  <p className="text-white/50">正在生成场景图片...</p>
                </div>
              ) : sceneImages.length > 0 ? (
                <div className="space-y-6">
                  {sceneImages.map((img) => (
                    <div key={img.sceneIndex} className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                        <h4 className="text-sm font-medium text-white/70">场景 {img.sceneIndex + 1}</h4>
                        <p className="text-xs text-white/40 mt-1">{img.prompt}</p>
                        {img.error && (
                          <p className="text-xs text-red-400/70 mt-1">{img.error}</p>
                        )}
                      </div>
                      {img.imageUrl ? (
                        <div className="aspect-video"><img src={img.imageUrl} alt={`场景 ${img.sceneIndex + 1}`} className="w-full h-full object-cover" /></div>
                      ) : (
                        <div className="aspect-video flex items-center justify-center bg-white/5">
                          <p className="text-xs text-white/30">{img.error ? "生成失败" : "图片生成失败"}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={handleGenerateVideo}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all flex items-center justify-center gap-2">
                    <Film size={16} />生成梦境视频 <ArrowRight size={16} />
                  </button>
                </div>
              ) : scenePrompts.length > 0 ? (
                <div className="space-y-6">
                  <p className="text-xs text-white/40">
                    以下为每个场景的提示词，可修改后再一键生图；主提示词（第一条）将用于画面生成，备选变体可对照或复制。
                  </p>
                  {scenePrompts.map((scene) => {
                    const primaryKey = `${scene.sceneIndex}-0`;
                    const primaryValue = promptDraftsByScene[scene.sceneIndex] ?? scene.prompts[0] ?? "";
                    return (
                      <div key={scene.sceneIndex} className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                          <h4 className="text-sm font-medium text-white/70">场景 {scene.sceneIndex + 1}</h4>
                          {scene.description && (
                            <p className="text-xs text-white/40 mt-1 leading-relaxed">{scene.description}</p>
                          )}
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[10px] text-indigo-300/80 uppercase tracking-wider">主提示词（用于生图）</span>
                              <button
                                type="button"
                                onClick={() => handleCopyPrompt(primaryValue, primaryKey)}
                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                title="复制"
                              >
                                {copiedIndex === primaryKey ? (
                                  <Check size={14} className="text-green-400" />
                                ) : (
                                  <Copy size={14} className="text-white/30" />
                                )}
                              </button>
                            </div>
                            <textarea
                              value={primaryValue}
                              onChange={(e) =>
                                setPromptDraftsByScene((prev) => ({
                                  ...prev,
                                  [scene.sceneIndex]: e.target.value,
                                }))
                              }
                              rows={5}
                              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/85 placeholder:text-white/25 focus:outline-none focus:border-indigo-500/45 resize-y min-h-[6rem]"
                              placeholder="编辑用于生成该场景画面的中文提示词"
                            />
                          </div>
                          {scene.prompts.length > 1 && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                              <span className="text-[10px] text-white/25 uppercase tracking-wider">备选变体（仅参考）</span>
                              {scene.prompts.slice(1).map((prompt, i) => {
                                const copyKey = `${scene.sceneIndex}-${i + 1}`;
                                return (
                                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                                    <p className="text-xs text-white/45 leading-relaxed whitespace-pre-wrap break-words flex-1">
                                      变体 {i + 2}：{prompt}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyPrompt(prompt, copyKey)}
                                      className="shrink-0 p-1 rounded hover:bg-white/10"
                                    >
                                      {copiedIndex === copyKey ? (
                                        <Check size={12} className="text-green-400" />
                                      ) : (
                                        <Copy size={12} className="text-white/30" />
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-white/40 shrink-0">生图模型</span>
                    <select
                      value={sceneImageModel}
                      onChange={(e) => setSceneImageModel(e.target.value as SceneImageModelId)}
                      disabled={isRenderingImages}
                      className="flex-1 min-w-[12rem] max-w-md bg-white/[0.06] border border-white/12 rounded-xl px-3 py-2 text-white/85 focus:outline-none focus:border-indigo-500/45 disabled:opacity-50"
                    >
                      {SCENE_IMAGE_MODEL_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id} className="bg-[#12121a]">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateSceneImages}
                    disabled={
                      isRenderingImages ||
                      scenePrompts.some((sp) => !(promptDraftsByScene[sp.sceneIndex] ?? sp.prompts[0])?.trim())
                    }
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={16} />
                    一键生成场景图
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-white/30">
                  <p>尚未生成提示词，请从「记忆补全」步骤进入</p>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "video" && (
            <motion.div key="video" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-3xl">
              <h2 className="text-lg font-medium text-white/80 mb-4"><Film size={18} className="inline mr-2 text-indigo-400" />梦境视频</h2>
              {audioBlobUrl && <div className="mb-4"><AudioPlayer src={audioBlobUrl} /></div>}

              {isGeneratingVideo ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 className="animate-spin text-indigo-400" size={40} />
                  <p className="text-white/50">正在生成梦境视频...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {videoUrl ? (
                    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                      <video src={videoUrl} controls className="w-full aspect-video" />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                      <p className="text-xs text-amber-400/70">视频生成API未配置或生成失败。</p>
                    </div>
                  )}

                  {videoPrompt && (
                    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                        <h4 className="text-sm font-medium text-white/70">视频提示词</h4>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{videoPrompt}</p>
                        <button onClick={() => handleCopyPrompt(videoPrompt, "video-prompt")}
                          className="mt-3 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                          {copiedIndex === "video-prompt" ? <><Check size={12} className="text-green-400" />已复制</> : <><Copy size={12} />复制提示词</>}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                    <h4 className="text-sm font-medium text-white/70 mb-3">场景参考帧</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {sceneImages.map((img) => (
                        <div key={img.sceneIndex} className="aspect-video rounded-lg overflow-hidden border border-white/10">
                          {img.imageUrl ? (
                            <img src={img.imageUrl} alt={`场景 ${img.sceneIndex + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center">
                              <span className="text-[10px] text-white/30">场景 {img.sceneIndex + 1}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSaveDream}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all">
                    保存梦境
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === "complete" && (
            <motion.div key="complete" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><Moon size={36} /></div>
              <div>
                <h2 className="text-2xl font-light text-white/90 mb-2">梦境已捕捉 ✓</h2>
                <p className="text-sm text-white/40">你的梦境锚点已保存，日后浏览时可触发回忆</p>
              </div>
              {audioBlobUrl && <div className="w-full"><AudioPlayer src={audioBlobUrl} label="回放录音" /></div>}
              <div className="flex gap-4">
                <button onClick={handleNewDream} className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm transition-colors">记录新梦境</button>
                <Link href="/journal" className="px-6 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm transition-colors">查看日志</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
