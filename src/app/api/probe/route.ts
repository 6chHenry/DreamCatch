import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import { DreamStructuredSchema } from "@/lib/schema";
import { MEMORY_PROBE_SYSTEM_PROMPT, MEMORY_PROBE_USER_PROMPT } from "@/lib/prompt-templates";
import { parseLLMJson } from "@/lib/llm-utils";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";

export async function POST(request: NextRequest) {
  try {
    const { dreamStructured, conversationHistory, userAnswer } = await request.json();

    if (!dreamStructured) {
      return NextResponse.json({ error: "No dream data provided" }, { status: 400 });
    }

    const { apiUrl, apiKey, model } = resolveOpenAICompatLLM(request.headers);

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json({ error: "LLM API not configured" }, { status: 500 });
    }

    const prompt = MEMORY_PROBE_USER_PROMPT(
      JSON.stringify(dreamStructured, null, 2),
      conversationHistory || "（对话刚开始）",
      userAnswer
    );

    const requestBody = buildLLMRequestBody(
      model,
      [
        { role: "system", content: MEMORY_PROBE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      { temperature: 0.5, responseFormat: { type: "json_object" } }
    );

    const response = await llmFetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Probe API error:", error);
      return NextResponse.json({ error: "LLM API call failed", detail: error }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 500 });
    }

    const result = parseLLMJson(content) as Record<string, unknown>;

    if (result.updatedDream) {
      try {
        result.updatedDream = DreamStructuredSchema.parse(result.updatedDream);
      } catch (validationError) {
        console.error("Dream validation error:", validationError);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Probe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
