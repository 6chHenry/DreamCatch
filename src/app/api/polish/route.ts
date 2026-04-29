import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import { DREAM_POLISH_SYSTEM_PROMPT, DREAM_POLISH_USER_PROMPT } from "@/lib/prompt-templates";
import { buildLLMRequestBody, resolveOpenAICompatLLM } from "@/lib/llm-request";

export async function POST(request: NextRequest) {
  try {
    const { rawText, conversationHistory, userRequest } = await request.json();

    if (!rawText || typeof rawText !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const { apiUrl, apiKey, model } = resolveOpenAICompatLLM(request.headers);

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json({ error: "LLM API not configured" }, { status: 500 });
    }

    let messages: Array<{ role: string; content: string }> = [];

    if (!conversationHistory || conversationHistory.length === 0) {
      messages = [
        { role: "system", content: DREAM_POLISH_SYSTEM_PROMPT },
        { role: "user", content: DREAM_POLISH_USER_PROMPT(rawText) },
      ];
    } else {
      messages = [
        { role: "system", content: DREAM_POLISH_SYSTEM_PROMPT },
        ...conversationHistory.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      if (userRequest) {
        messages.push({ role: "user", content: userRequest });
      }
    }

    const requestBody = buildLLMRequestBody(model, messages, { temperature: 0.3 });

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
      console.error("Polish API error:", error);
      return NextResponse.json({ error: "LLM API call failed", detail: error }, { status: 500 });
    }

    const data = await response.json();
    const polishedText = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ polishedText });
  } catch (error) {
    console.error("Polish error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
