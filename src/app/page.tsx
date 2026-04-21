"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, BookOpen, Loader2, ArrowRight, SkipForward, Sparkles, Copy, Check, Film, ChevronDown, Users, Wand2 } from "lucide-react";
import VoiceRecorder from "@/components/VoiceRecorder";
import ProbeChat from "@/components/ProbeChat";
import AudioPlayer from "@/components/AudioPlayer";
import { useDreamStore } from "@/stores/dream-store";
import type { Dream, DreamFlowStep, ProbeMessage } from "@/types/dream";
import { messageFromErrorResponse } from "@/lib/llm-utils";
import Link from "next/link";

const MODEL_OPTIONS = [
  { value: "gpt-5.4-mini", label: "GPT 5.4 Mini (openclaudecode)", apiUrl: "https://www.openclaudecode.cn/v1", apiKey: "sk-zpURIsonfImHJYd3WO9pHV3DGyyqQNmTTGObW6vU29uMlRZo" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4 (openclaudecode)", apiUrl: "https://www.openclaudecode.cn/v1", apiKey: "sk-UincVUyqAM6f9tuTClhVvkoKLCqJUgiIdx6I3WbLPnZTlN98" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (4Router)", apiUrl: "https://4Router.net/v1", apiKey: "sk-aP0IwE8BnfVLVkLyDcPTIjuZ3jaZpIHv2azuWFTnnAaTpoto" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (4Router)", apiUrl: "https://4Router.net/v1", apiKey: "sk-aP0IwE8BnfVLVkLyDcPTIjuZ3jaZpIHv2azuWFTnnAaTpoto" },
  { value: "doubao-seed-2-0-mini-260215", label: "Doubao Seed 2.0 Mini (Doubao)", apiUrl: "https://ark.cn-beijing.volces.com/api/v3", apiKey: "ark-3813c0f1-867d-42d4-baa8-61bd6726fac9-77a54" },
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
  const [showTextInput, setShowTextInput] = useState(false);
  const [probeComplete, setProbeComplete] = useState(false);
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([]);
  const [sceneImages, setSceneImages] = useState<Array<{ sceneIndex: number; imageUrl: string; prompt: string; error?: string }>>([]);
  const [isRendering, setIsRendering] = useState(false);
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
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const response = await fetch("/api/asr", { method: "POST", body: formData });
          if (response.ok) {
            const data = await response.json();
            text = data.text;
            if (data.audioFileName) {
              setAudioFileName(data.audioFileName);
              setAudioBlobUrl(`/api/audio/${data.audioFileName}`);
            }
          } else {
            throw new Error("ASR failed");
          }
        } else {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          fetch("/api/asr", { method: "POST", body: formData }).then((response) => {
            if (response.ok) {
              response.json().then((data) => {
                if (data.audioFileName) {
                  setAudioFileName(data.audioFileName);
                  setAudioBlobUrl(`/api/audio/${data.audioFileName}`);
                }
              });
            }
          }).catch(() => {});
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

    setIsProcessing(true);
    setCurrentStep("parsing");

    try {
      const parseResponse = await fetch("/api/parse", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ text: textToParse }),
      });
      if (!parseResponse.ok) throw new Error("Parse failed");
      const structured = await parseResponse.json();

      const dream: Dream = {
        id: crypto.randomUUID(),
        title: structured.narrative.summary?.slice(0, 20) || "未命名梦境",
        rawText: textToParse, structured, scenes: [],
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
    setIsRendering(true);

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: modelHeaders(),
        body: JSON.stringify({ dreamStructured: currentDream.structured }),
      });
      if (!response.ok) throw new Error("Render failed");
      const result = await response.json();

      if (result.scenePrompts) {
        setScenePrompts(result.scenePrompts.map((sp: { sceneIndex: number; prompts: string[] }) => ({
          sceneIndex: sp.sceneIndex,
          description: currentDream.structured.scenes?.[sp.sceneIndex]?.description || `场景 ${sp.sceneIndex + 1}`,
          prompts: sp.prompts,
        })));
      }
      if (result.sceneImages) {
        setSceneImages(result.sceneImages);
      }
    } catch (error) {
      console.error("Render error:", error);
    } finally {
      setIsRendering(false);
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
          scenes: sceneImages.map((img, i) => ({
            id: crypto.randomUUID(), sceneIndex: img.sceneIndex,
            imageUrl: img.imageUrl, promptUsed: img.prompt, isSelected: i === 0,
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
    setTextInput(""); setShowTextInput(false); setProbeComplete(false);
    setScenePrompts([]); setSceneImages([]); setIsRendering(false);
    setVideoPrompt(""); setVideoUrl(""); setIsGeneratingVideo(false);
    setAudioFileName("");
    setPolishedText(""); setPolishMessages([]); setPolishInput("");
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
          <span className="text-xs text-white/30">DreamCatch AI</span>
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
              <h2 className="text-2xl font-light text-white/80 mb-2">你梦到了什么？</h2>
              <p className="text-sm text-white/40 mb-8">刚醒来时记忆最鲜活，按下按钮开始口述</p>
              <VoiceRecorder onRecordingComplete={handleRecordingComplete} />
              <div className="mt-8 w-full">
                <button onClick={() => setShowTextInput(!showTextInput)} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                  {showTextInput ? "收起文字输入" : "或者用文字描述梦境 →"}
                </button>
                {showTextInput && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                    <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="描述你的梦境..." rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 resize-none" />
                    <button onClick={handleTextInput} disabled={!textInput.trim()}
                      className="mt-2 w-full py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium transition-colors disabled:opacity-50">
                      开始解析
                    </button>
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
                    生成场景图片 <ArrowRight size={16} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentStep === "rendering" && (
            <motion.div key="rendering" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-3xl">
              <h2 className="text-lg font-medium text-white/80 mb-4"><Sparkles size={18} className="inline mr-2 text-indigo-400" />场景生图</h2>
              {audioBlobUrl && <div className="mb-4"><AudioPlayer src={audioBlobUrl} /></div>}

              {isRendering ? (
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
                          <p className="text-xs text-white/30">{img.error ? '生成失败' : '图片生成失败'}</p>
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
                  <p className="text-xs text-white/30">图像生成API未配置，以下为生成的提示词</p>
                  {scenePrompts.map((scene) => (
                    <div key={scene.sceneIndex} className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                        <h4 className="text-sm font-medium text-white/70">场景 {scene.sceneIndex + 1}</h4>
                        {scene.description && <p className="text-xs text-white/40 mt-1">{scene.description}</p>}
                      </div>
                      <div className="divide-y divide-white/5">
                        {scene.prompts.map((prompt, i) => {
                          const copyKey = `${scene.sceneIndex}-${i}`;
                          return (
                            <div key={i} className="px-4 py-3 group relative">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <span className="text-[10px] text-white/20 uppercase tracking-wider">变体 {i + 1}</span>
                                  <p className="text-xs text-white/60 mt-1 leading-relaxed whitespace-pre-wrap break-words">{prompt}</p>
                                </div>
                                <button onClick={() => handleCopyPrompt(prompt, copyKey)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="复制提示词">
                                  {copiedIndex === copyKey ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-white/30 group-hover:text-white/60" />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button onClick={handleGenerateVideo}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-sm font-medium transition-all flex items-center justify-center gap-2">
                    <Film size={16} />生成梦境视频 <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-white/30"><p>场景生成失败，请重试</p></div>
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
