import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import type { Dream } from "@/types/dream";
import { getDreamById } from "@/lib/dream-store";
import {
  DREAM_INTERPRET_SYSTEM_PROMPT,
  DREAM_INTERPRET_USER_PROMPT,
} from "@/lib/prompt-templates";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";

export const runtime = "nodejs";

const RAW_TEXT_MAX = 14_000;

function buildInterpretBundle(dream: Dream): string {
  const raw =
    dream.rawText.length > RAW_TEXT_MAX
      ? `${dream.rawText.slice(0, RAW_TEXT_MAX)}\n…（原文较长，已截断末尾）`
      : dream.rawText;
  const bundle = {
    title: dream.title,
    narrativeSummary: dream.structured.narrative.summary,
    characters: dream.structured.characters.map((c) => ({
      identity: c.identity,
      name: c.name,
      relationship: c.relationship,
      appearance: c.appearance,
    })),
    sceneDescriptions: dream.structured.scenes.map((s) => s.description),
    emotions: dream.structured.emotions,
    anomalies: dream.structured.anomalies,
    meta: dream.structured.meta,
    rawText: raw,
  };
  return JSON.stringify(bundle, null, 2);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dream = getDreamById(id);
    if (!dream) {
      return NextResponse.json({ error: "梦境不存在" }, { status: 404 });
    }

    /** 与 /api/parse、/api/polish 一致：凭请求头 x-api-url / x-model / x-api-key（可为空），服务端按网关解析 OPENCLAUDECODE_* 等 */
    const { apiUrl, apiKey, model } = resolveOpenAICompatLLM(request.headers);
    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json(
        {
          error: "未配置文本模型",
          detail:
            "请配置 NEXT_PUBLIC_LLM_* 或在 .env.local 中配置 OPENCLAUDECODE_* / GEMINI_* / DOUBAO_*（与首页润色、解析相同）。",
        },
        { status: 500 }
      );
    }

    const userContent = DREAM_INTERPRET_USER_PROMPT(buildInterpretBundle(dream));
    const body = buildLLMRequestBody(
      model,
      [
        { role: "system", content: DREAM_INTERPRET_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { temperature: 0.65 }
    );

    const res = await llmFetch(`${apiUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: "模型调用失败", detail: t.slice(0, 800) }, { status: 502 });
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "模型返回空内容" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      interpretation: text,
      model,
    });
  } catch (e) {
    console.error("dream interpret:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
