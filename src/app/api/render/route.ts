import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { DREAM_RENDER_PROMPT_SYSTEM, DREAM_RENDER_PROMPT_USER } from "@/lib/prompt-templates";
import { parseLLMJson } from "@/lib/llm-utils";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";
import { pickReferencePersonForScene } from "@/lib/person-reference-match";
import { findPersonForCharacter, personReferenceFilePath } from "@/lib/person-store";
import type { DreamStructured } from "@/types/dream";

export const runtime = "nodejs";

export type ScenePromptPayload = { sceneIndex: number; prompts: string[] };

async function generateScenePromptsWithLLM(
  dreamStructured: DreamStructured,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<ScenePromptPayload[]> {
  const requestBody = buildLLMRequestBody(
    model,
    [
      { role: "system", content: DREAM_RENDER_PROMPT_SYSTEM },
      { role: "user", content: DREAM_RENDER_PROMPT_USER(JSON.stringify(dreamStructured, null, 2)) },
    ],
    { temperature: 0.7, responseFormat: { type: "json_object" } }
  );

  const promptResponse = await fetch(`${apiUrl}/chat/completions`, {
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

  return parseLLMJson(promptsContent) as ScenePromptPayload[];
}

async function generateSceneImagesFromPrompts(
  scenePrompts: ScenePromptPayload[],
  dreamStructured: DreamStructured
): Promise<
  Array<{
    sceneIndex: number;
    imageUrl: string;
    prompt: string;
    error?: string;
  }>
> {
  const doubaoApiUrl = process.env.DOUBAO_API_URL;
  const doubaoApiKey = process.env.DOUBAO_API_KEY;
  const doubaoImageModel = process.env.DOUBAO_IMAGE_MODEL || "doubao-seedream-4-5-251128";

  if (!doubaoApiUrl || !doubaoApiKey) {
    throw new Error("图像生成 API 未配置（DOUBAO_API_URL / DOUBAO_API_KEY）");
  }

  const scenes = dreamStructured.scenes || [];
  const characters = dreamStructured.characters || [];

  const sceneImages: Array<{
    sceneIndex: number;
    imageUrl: string;
    prompt: string;
    error?: string;
  }> = [];

  for (const scenePrompt of scenePrompts) {
    const prompt = scenePrompt.prompts[0];
    if (!prompt) continue;

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

    const promptFinal = refBase64
      ? `【人物一致性】请与参考图中人物面部与体态保持一致；其余按场景描述作画。\n${prompt}`
      : prompt;

    try {
      const imageBody: Record<string, unknown> = {
        model: doubaoImageModel,
        prompt: promptFinal,
        size: "2K",
        response_format: "b64_json",
        stream: false,
        extra_body: {
          watermark: true,
          sequential_image_generation: "auto",
          sequential_image_generation_options: {
            max_images: 1,
          },
        },
      };
      if (refBase64) {
        imageBody.image = refBase64;
      }

      let response = await fetch(`${doubaoApiUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${doubaoApiKey}`,
        },
        body: JSON.stringify(imageBody),
      });

      if (!response.ok && refBase64) {
        console.warn(
          `Scene ${scenePrompt.sceneIndex}: image API failed with reference, retrying without reference image`
        );
        const { image: _drop, ...rest } = imageBody;
        response = await fetch(`${doubaoApiUrl}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${doubaoApiKey}`,
          },
          body: JSON.stringify({
            ...rest,
            prompt,
          }),
        });
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
        continue;
      }

      const data = await response.json();

      let imageUrl = "";
      if (data.data && data.data[0]) {
        const imageData = data.data[0];
        if (imageData.b64_json) {
          imageUrl = `data:image/png;base64,${imageData.b64_json}`;
        } else if (imageData.url) {
          imageUrl = imageData.url;
        }
      }

      if (!imageUrl) {
        sceneImages.push({
          sceneIndex: scenePrompt.sceneIndex,
          imageUrl: "",
          prompt: promptFinal,
          error: "No image in response",
        });
        continue;
      }

      sceneImages.push({
        sceneIndex: scenePrompt.sceneIndex,
        imageUrl,
        prompt: promptFinal,
      });
    } catch (error) {
      console.error(`Image generation error for scene ${scenePrompt.sceneIndex}:`, error);
      sceneImages.push({
        sceneIndex: scenePrompt.sceneIndex,
        imageUrl: "",
        prompt: promptFinal,
        error: (error as Error).message,
      });
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
    };

    const { dreamStructured, phase = "prompts", scenePrompts: incomingScenePrompts } = body;

    if (!dreamStructured) {
      return NextResponse.json({ error: "No dream data provided" }, { status: 400 });
    }

    if (phase === "images") {
      if (!incomingScenePrompts || !Array.isArray(incomingScenePrompts) || incomingScenePrompts.length === 0) {
        return NextResponse.json({ error: "缺少 scenePrompts" }, { status: 400 });
      }

      try {
        const sceneImages = await generateSceneImagesFromPrompts(incomingScenePrompts, dreamStructured);
        return NextResponse.json({
          status: "images_ready",
          scenePrompts: incomingScenePrompts,
          sceneImages,
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

    let scenePrompts: ScenePromptPayload[];
    try {
      scenePrompts = await generateScenePromptsWithLLM(dreamStructured, apiUrl, apiKey, model);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Prompt generation failed", detail }, { status: 500 });
    }

    return NextResponse.json({
      status: "prompts_ready",
      scenePrompts,
      message: "提示词已生成，可在前端编辑后再一键生图",
    });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
