import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import { DREAM_RENDER_PROMPT_SYSTEM, DREAM_RENDER_PROMPT_USER } from "@/lib/prompt-templates";
import { parseLLMJson } from "@/lib/llm-utils";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";
import { pickReferencePersonForScene } from "@/lib/person-reference-match";
import { findPersonForCharacter, personReferenceFilePath } from "@/lib/person-store";
import type { DreamStructured, StyleGuide } from "@/types/dream";
import { generateGptImage2SceneImage } from "@/lib/gpt-image-generate";
import {
  DEFAULT_SCENE_IMAGE_MODEL,
  isGptImage2PipelineModel,
  parseSceneImageModelId,
  type SceneImageModelId,
} from "@/lib/scene-image-model";

export const runtime = "nodejs";

export type ScenePromptPayload = { sceneIndex: number; prompts: string[] };

type PromptsWithStyleGuide = {
  scenePrompts: ScenePromptPayload[];
  styleGuide: StyleGuide;
};

async function generateScenePromptsWithLLM(
  dreamStructured: DreamStructured,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<PromptsWithStyleGuide> {
  const requestBody = buildLLMRequestBody(
    model,
    [
      { role: "system", content: DREAM_RENDER_PROMPT_SYSTEM },
      { role: "user", content: DREAM_RENDER_PROMPT_USER(JSON.stringify(dreamStructured, null, 2)) },
    ],
    { temperature: 0.7, responseFormat: { type: "json_object" } }
  );

  const promptResponse = await llmFetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!promptResponse.ok) {
    const error = await promptResponse.text();
    console.error("Prompt generation error:", error);
    throw new Error(`Prompt generation failed: ${error}`);
  }

  const promptData = await promptResponse.json();
  const promptsContent = promptData.choices?.[0]?.message?.content;

  if (!promptsContent) {
    throw new Error("Empty prompt response from LLM");
  }

  const parsed = parseLLMJson(promptsContent) as Record<string, unknown> | ScenePromptPayload[];

  // Support both old array format and new {styleGuide, scenes} object format
  if (Array.isArray(parsed)) {
    return { scenePrompts: parsed as ScenePromptPayload[], styleGuide: {} };
  }
  const scenesRaw = parsed.scenes ?? parsed;
  return {
    scenePrompts: (Array.isArray(scenesRaw) ? scenesRaw : []) as ScenePromptPayload[],
    styleGuide: (parsed.styleGuide as StyleGuide) ?? {},
  };
}

/**
 * Builds a consistency prefix block from the style guide to prepend to every
 * scene image prompt, ensuring cross-scene visual coherence.
 */
function buildStyleGuidePrefix(styleGuide: StyleGuide): string {
  const parts: string[] = [];

  const styleParts: string[] = [];
  if (styleGuide.artStyle) styleParts.push(styleGuide.artStyle);
  if (styleGuide.colorPalette) styleParts.push(`主色调：${styleGuide.colorPalette}`);
  if (styleGuide.moodKeywords) styleParts.push(`氛围：${styleGuide.moodKeywords}`);
  if (styleParts.length > 0) {
    parts.push(`【梦境画风】${styleParts.join("；")}。`);
  }

  const anchors = styleGuide.characterAnchors;
  if (anchors && Object.keys(anchors).length > 0) {
    const charParts = Object.entries(anchors)
      .map(([name, desc]) => `${name}：${desc}`)
      .join("；");
    parts.push(`【人物造型锚定】${charParts}。`);
  }

  return parts.join("\n");
}

function parseImageGenerationResponse(data: {
  data?: Array<{ b64_json?: string; url?: string }>;
}): string {
  const imageData = data.data?.[0];
  if (!imageData) return "";
  if (imageData.b64_json) {
    const raw = imageData.b64_json.trim();
    if (raw.startsWith("data:image/")) return raw;
    return `data:image/png;base64,${raw}`;
  }
  if (imageData.url) {
    return imageData.url;
  }
  return "";
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isRateLimitErrorPayload(bodyText: string): boolean {
  const t = bodyText.toLowerCase();
  if (t.includes("rate_limit") || t.includes("no available accounts")) return true;
  try {
    const j = JSON.parse(bodyText) as { error?: { code?: string; type?: string; message?: string } };
    const code = `${j.error?.code || ""} ${j.error?.type || ""}`.toLowerCase();
    const msg = (j.error?.message || "").toLowerCase();
    return code.includes("rate_limit") || msg.includes("rate_limit") || msg.includes("no available accounts");
  } catch {
    return false;
  }
}

/** 中转站在池子耗尽时返回 rate_limit_exceeded；带指数退避重试。 */
async function grokImageFetch(url: string, init: RequestInit, logLabel: string): Promise<Response> {
  const maxAttempts = Math.max(1, Math.min(10, Number(process.env.GROK_IMAGE_RATE_LIMIT_RETRIES) || 6));
  const baseMs = Math.max(400, Number(process.env.GROK_IMAGE_RATE_LIMIT_BASE_MS) || 2200);
  let lastStatus = 500;
  let lastText = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await llmFetch(url, init);
    lastStatus = res.status;
    if (res.ok) return res;
    lastText = await res.text();
    if (attempt + 1 < maxAttempts && isRateLimitErrorPayload(lastText)) {
      const wait = Math.min(60_000, baseMs * 2 ** attempt + Math.random() * 600);
      console.warn(`${logLabel}: rate limit, retry ${attempt + 2}/${maxAttempts} after ${Math.round(wait)}ms`);
      await sleep(wait);
      continue;
    }
    break;
  }
  return new Response(lastText, { status: lastStatus });
}

async function generateSceneImagesFromPrompts(
  scenePrompts: ScenePromptPayload[],
  dreamStructured: DreamStructured,
  imageModel: SceneImageModelId,
  batch?: { offset: number; size: number },
  styleGuide?: StyleGuide
): Promise<
  Array<{
    sceneIndex: number;
    imageUrl: string;
    prompt: string;
    error?: string;
  }>
> {
  const grokApiUrl = process.env.GROK_API_URL?.replace(/\/$/, "");
  const grokApiKey = process.env.GROK_API_KEY;
  const grokModelId = process.env.GROK_IMAGE_MODEL?.trim() || "grok-imagine-image-lite";

  if (imageModel === "grok-imagine-image-lite" && (!grokApiUrl || !grokApiKey)) {
    throw new Error("Grok 生图未配置（GROK_API_URL / GROK_API_KEY）");
  }

  const scenes = dreamStructured.scenes || [];
  const characters = dreamStructured.characters || [];

  const promptsToRun =
    batch != null
      ? scenePrompts.slice(
          Math.max(0, batch.offset),
          Math.max(0, batch.offset) + Math.max(1, batch.size)
        )
      : scenePrompts;

  const sceneImages: Array<{
    sceneIndex: number;
    imageUrl: string;
    prompt: string;
    error?: string;
  }> = [];

  let didGeneratePriorScene = batch != null && batch.offset > 0;
  const gapMsRaw = Number(process.env.GROK_IMAGE_SCENE_GAP_MS);
  const sceneGapMs = Number.isFinite(gapMsRaw) && gapMsRaw >= 0 ? gapMsRaw : 2800;

  for (const scenePrompt of promptsToRun) {
    const prompt = scenePrompt.prompts[0];
    if (!prompt) continue;

    if (didGeneratePriorScene && sceneGapMs > 0) {
      await sleep(sceneGapMs);
    }

    const scene = scenes[scenePrompt.sceneIndex];
    const sceneDesc = scene?.description || "";
    const refPerson = pickReferencePersonForScene(sceneDesc, characters, findPersonForCharacter);

    let refBase64: string | undefined;
    if (refPerson?.referenceImageFilename) {
      try {
        const fp = personReferenceFilePath(refPerson.referenceImageFilename);
        if (fs.existsSync(fp)) {
          refBase64 = fs.readFileSync(fp).toString("base64");
        }
      } catch (e) {
        console.error("Read person reference image:", e);
      }
    }

    const stylePrefix = styleGuide ? buildStyleGuidePrefix(styleGuide) : "";
    const promptWithStyle = stylePrefix ? `${stylePrefix}\n${prompt}` : prompt;
    const promptFinal = refBase64
      ? `【参考图人物一致性】请与参考图中人物面部与体态保持一致；其余按场景描述作画。\n${promptWithStyle}`
      : promptWithStyle;

    try {
      if (isGptImage2PipelineModel(imageModel)) {
        const gptBase =
          process.env.GPT_IMAGE2_API_URL?.replace(/\/$/, "") ||
          process.env.OPENCLAUDECODE_API_URL?.replace(/\/$/, "") ||
          "";
        const gptKey = process.env.GPT_IMAGE2_API_KEY?.trim() || "";
        if (!gptBase || !gptKey) {
          sceneImages.push({
            sceneIndex: scenePrompt.sceneIndex,
            imageUrl: "",
            prompt: promptFinal,
            error: "未配置 GPT_IMAGE2_API_KEY（可选 GPT_IMAGE2_API_URL，默认同 OPENCLAUDECODE_API_URL）",
          });
        } else {
          const refBuf = refBase64 ? Buffer.from(refBase64, "base64") : undefined;
          const gptResult = await generateGptImage2SceneImage({
            baseUrl: gptBase,
            apiKey: gptKey,
            prompt: promptFinal,
            refPngBuffer: refBuf,
            model: imageModel,
          });
          if ("error" in gptResult) {
            sceneImages.push({
              sceneIndex: scenePrompt.sceneIndex,
              imageUrl: "",
              prompt: promptFinal,
              error: gptResult.error,
            });
          } else {
            sceneImages.push({
              sceneIndex: scenePrompt.sceneIndex,
              imageUrl: gptResult.imageUrl,
              prompt: promptFinal,
            });
          }
        }
      } else {
        const authHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${grokApiKey}`,
        };

        const generationBody: Record<string, unknown> = {
          model: grokModelId,
          prompt: promptFinal,
          response_format: "b64_json",
          resolution: "2k",
          aspect_ratio: "16:9",
        };

        const editsBody: Record<string, unknown> = {
          model: grokModelId,
          prompt: promptFinal,
          response_format: "b64_json",
          resolution: "2k",
          image: {
            url: `data:image/png;base64,${refBase64}`,
            type: "image_url",
          },
        };

        const label = `Scene ${scenePrompt.sceneIndex} image`;
        let response: Response;
        if (refBase64) {
          response = await grokImageFetch(
            `${grokApiUrl}/images/edits`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify(editsBody),
            },
            `${label} (edits)`
          );
        } else {
          response = await grokImageFetch(
            `${grokApiUrl}/images/generations`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify(generationBody),
            },
            `${label} (generations)`
          );
        }

        if (!response.ok && refBase64) {
          console.warn(
            `Scene ${scenePrompt.sceneIndex}: image edit API failed, retrying text-to-image without reference`
          );
          response = await grokImageFetch(
            `${grokApiUrl}/images/generations`,
            {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({
                ...generationBody,
                prompt,
              }),
            },
            `${label} (generations, no ref)`
          );
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Image generation error for scene ${scenePrompt.sceneIndex}:`, errorText);

          let errorMessage = "图片生成失败";
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            }
          } catch {
            /* ignore */
          }

          sceneImages.push({
            sceneIndex: scenePrompt.sceneIndex,
            imageUrl: "",
            prompt: refBase64 ? promptFinal : prompt,
            error: errorMessage,
          });
        } else {
          const data = await response.json();
          const imageUrl = parseImageGenerationResponse(data);

          if (!imageUrl) {
            sceneImages.push({
              sceneIndex: scenePrompt.sceneIndex,
              imageUrl: "",
              prompt: promptFinal,
              error: "No image in response",
            });
          } else {
            sceneImages.push({
              sceneIndex: scenePrompt.sceneIndex,
              imageUrl,
              prompt: promptFinal,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Image generation error for scene ${scenePrompt.sceneIndex}:`, error);
      sceneImages.push({
        sceneIndex: scenePrompt.sceneIndex,
        imageUrl: "",
        prompt: promptFinal,
        error: (error as Error).message,
      });
    } finally {
      didGeneratePriorScene = true;
    }
  }

  return sceneImages;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      dreamStructured?: DreamStructured;
      phase?: "prompts" | "images";
      scenePrompts?: ScenePromptPayload[];
      imageModel?: string;
      /** 全局视觉风格锚点，由 prompts 阶段返回，images 阶段传入以注入一致性前缀 */
      styleGuide?: StyleGuide;
      /** 与 imageBatchSize 同时传入时只生成本批；不传则一次生成全部 */
      imageBatchOffset?: number;
      imageBatchSize?: number;
    };

    const {
      dreamStructured,
      phase = "prompts",
      scenePrompts: incomingScenePrompts,
      imageModel: imageModelRaw,
      styleGuide: incomingStyleGuide,
    } = body;
    const imageModel = parseSceneImageModelId(imageModelRaw) ?? DEFAULT_SCENE_IMAGE_MODEL;

    if (!dreamStructured) {
      return NextResponse.json({ error: "No dream data provided" }, { status: 400 });
    }

    if (phase === "images") {
      if (!incomingScenePrompts || !Array.isArray(incomingScenePrompts) || incomingScenePrompts.length === 0) {
        return NextResponse.json({ error: "缺少 scenePrompts" }, { status: 400 });
      }

      let batch: { offset: number; size: number } | undefined;
      const rawSize = body.imageBatchSize;
      if (typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize > 0) {
        const off = Math.max(0, Math.floor(Number(body.imageBatchOffset) || 0));
        batch = { offset: off, size: Math.min(Math.floor(rawSize), 32) };
      }

      try {
        const sceneImages = await generateSceneImagesFromPrompts(
          incomingScenePrompts,
          dreamStructured,
          imageModel,
          batch,
          incomingStyleGuide
        );
        const total = incomingScenePrompts.length;
        const imageBatch =
          batch != null
            ? {
                offset: batch.offset,
                size: batch.size,
                total,
                nextOffset: batch.offset + batch.size,
                hasMore: batch.offset + batch.size < total,
              }
            : undefined;

        return NextResponse.json({
          status: "images_ready",
          scenePrompts: incomingScenePrompts,
          sceneImages,
          ...(imageBatch ? { imageBatch } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Image phase error:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    const { apiUrl, apiKey, model } = resolveOpenAICompatLLM(request.headers);

    if (!apiUrl || !apiKey) {
      return NextResponse.json({ error: "LLM API not configured" }, { status: 500 });
    }

    let promptsResult: PromptsWithStyleGuide;
    try {
      promptsResult = await generateScenePromptsWithLLM(dreamStructured, apiUrl, apiKey, model);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Prompt generation failed", detail }, { status: 500 });
    }

    return NextResponse.json({
      status: "prompts_ready",
      scenePrompts: promptsResult.scenePrompts,
      styleGuide: promptsResult.styleGuide,
      message: "提示词已生成，可在前端编辑后再一键生图",
    });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
