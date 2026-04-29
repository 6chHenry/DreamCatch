import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import { getAllDreamRecords, updateDream } from "@/lib/dream-store";
import { DREAM_TITLE_SYSTEM_PROMPT, DREAM_TITLE_USER_PROMPT } from "@/lib/prompt-templates";
import { buildLLMRequestBody } from "@/lib/llm-request";
import { parseLLMJson } from "@/lib/llm-utils";

function resolveLLM(): { apiUrl: string; apiKey: string; model: string } {
  // use openclaudecode GPT key as primary (same gateway as scene prompts)
  const ocUrl =
    process.env.OPENCLAUDECODE_API_URL?.trim() || "https://www.openclaudecode.cn/v1";
  const ocKey =
    process.env.OPENCLAUDECODE_API_KEY_GPT?.trim() ||
    process.env.OPENCLAUDECODE_API_KEY?.trim() ||
    "";
  if (ocKey) return { apiUrl: ocUrl, apiKey: ocKey, model: "gpt-5.4-mini" };

  // fallback to GEMINI / 4Router
  return {
    apiUrl: process.env.GEMINI_API_URL?.trim() || "",
    apiKey: process.env.GEMINI_API_KEY?.trim() || "",
    model: process.env.GEMINI_MODEL?.trim() || "gpt-5.4-mini",
  };
}

async function generateTitle(
  summary: string,
  rawExcerpt: string,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  const body = buildLLMRequestBody(
    model,
    [
      { role: "system", content: DREAM_TITLE_SYSTEM_PROMPT },
      { role: "user", content: DREAM_TITLE_USER_PROMPT(summary, rawExcerpt) },
    ],
    { temperature: 0.8, responseFormat: { type: "json_object" } }
  );

  const res = await llmFetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`LLM error: ${await res.text()}`);

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseLLMJson(content) as { title?: string };
  const title = parsed?.title?.trim() ?? "";
  if (!title) throw new Error("Empty title from LLM");
  return title;
}

/**
 * POST /api/dreams/retitle
 * body: { dreamId?: string }   — omit dreamId to retitle all dreams
 * Returns: { results: Array<{ id, oldTitle, newTitle, ok, error? }> }
 */
export async function POST(request: NextRequest) {
  const { dreamId } = (await request.json().catch(() => ({}))) as {
    dreamId?: string;
  };

  const { apiUrl, apiKey, model } = resolveLLM();
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: "LLM API 未配置" }, { status: 500 });
  }

  const allDreams = getAllDreamRecords();
  const targets = dreamId ? allDreams.filter((d) => d.id === dreamId) : allDreams;

  if (targets.length === 0) {
    return NextResponse.json({ error: "未找到梦境" }, { status: 404 });
  }

  const results: Array<{ id: string; oldTitle: string; newTitle: string; ok: boolean; error?: string }> = [];

  for (const dream of targets) {
    const summary = dream.structured.narrative?.summary ?? "";
    const rawExcerpt = dream.rawText.slice(0, 200);
    try {
      const newTitle = await generateTitle(summary, rawExcerpt, apiUrl, apiKey, model);
      updateDream(dream.id, { title: newTitle });
      results.push({ id: dream.id, oldTitle: dream.title, newTitle, ok: true });
    } catch (e) {
      results.push({
        id: dream.id,
        oldTitle: dream.title,
        newTitle: dream.title,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ results });
}
