import { NextRequest, NextResponse } from "next/server";
import { DreamStructuredSchema } from "@/lib/schema";
import { DREAM_PARSER_SYSTEM_PROMPT, DREAM_PARSER_USER_PROMPT } from "@/lib/prompt-templates";
import { parseLLMJson } from "@/lib/llm-utils";
import { buildLLMRequestBody } from "@/lib/llm-request";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiUrl = request.headers.get("x-api-url") || process.env.GEMINI_API_URL;
    const apiKey = request.headers.get("x-api-key") || process.env.GEMINI_API_KEY;
    const model = request.headers.get("x-model") || process.env.GEMINI_MODEL || "gpt-5.4-mini";

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json({ error: "LLM API not configured" }, { status: 500 });
    }

    const result = await callLLMWithRetry(text, apiUrl, apiKey, model, 2);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
