import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DreamStructuredSchema } from "@/lib/schema";
import { DREAM_PARSER_SYSTEM_PROMPT, DREAM_PARSER_USER_PROMPT } from "@/lib/prompt-templates";
import { parseLLMJson } from "@/lib/llm-utils";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";

function errorDetail(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const { apiUrl, apiKey, model } = resolveOpenAICompatLLM(request.headers);

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json(
        {
          error: "LLM API not configured",
          detail:
            "请配置 NEXT_PUBLIC_LLM_* 或在 .env.local 中配置对应服务商的 OPENCLAUDECODE_* / GEMINI_* / DOUBAO_*。",
        },
        { status: 500 }
      );
    }

    const result = await callLLMWithRetry(text, apiUrl, apiKey, model, 2);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Parse error:", error);
    const detail = errorDetail(error);
    return NextResponse.json({ error: "Parse failed", detail }, { status: 500 });
  }
}

async function callLLMWithRetry(
  text: string,
  apiUrl: string,
  apiKey: string,
  model: string,
  maxRetries: number
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const requestBody = buildLLMRequestBody(
        model,
        [
          { role: "system", content: DREAM_PARSER_SYSTEM_PROMPT },
          { role: "user", content: DREAM_PARSER_USER_PROMPT(text) },
        ],
        { temperature: 0.3, responseFormat: { type: "json_object" } }
      );

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${error}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response from LLM");
      }

      const parsed = parseLLMJson(content);
      const validated = DreamStructuredSchema.parse(parsed);
      return validated;
    } catch (error) {
      lastError = error;
      console.error(`Parse attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError;
}
