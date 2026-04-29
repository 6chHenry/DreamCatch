import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";
import { PERSON_ORGANIZE_SYSTEM_PROMPT, PERSON_ORGANIZE_USER_PROMPT } from "@/lib/prompt-templates";
import { buildLLMRequestBody, resolveLlmPreferClientKeyElseOpenCodeGpt } from "@/lib/llm-request";
import { parseLLMJson } from "@/lib/llm-utils";
import { getAllPersons } from "@/lib/person-store";
import { executePersonOrganizePlan, type PersonOrganizePlan } from "@/lib/person-organize";

export const runtime = "nodejs";

function normalizePlan(raw: unknown): PersonOrganizePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const deletePersonIds = Array.isArray(o.deletePersonIds)
    ? o.deletePersonIds.filter((x): x is string => typeof x === "string")
    : [];
  const mergeGroups = Array.isArray(o.mergeGroups)
    ? o.mergeGroups
        .filter((g): g is NonNullable<typeof g> => g !== null && typeof g === "object")
        .map((g) => {
          const m = g as Record<string, unknown>;
          const keepPersonId = typeof m.keepPersonId === "string" ? m.keepPersonId : "";
          const absorbPersonIds = Array.isArray(m.absorbPersonIds)
            ? m.absorbPersonIds.filter((x): x is string => typeof x === "string")
            : [];
          const canonicalName = typeof m.canonicalName === "string" ? m.canonicalName : "";
          return { keepPersonId, absorbPersonIds, canonicalName };
        })
        .filter((g) => g.keepPersonId && g.canonicalName.trim())
    : [];
  const renameOnly = Array.isArray(o.renameOnly)
    ? o.renameOnly
        .filter((r): r is NonNullable<typeof r> => r !== null && typeof r === "object")
        .map((r) => {
          const x = r as Record<string, unknown>;
          return {
            personId: typeof x.personId === "string" ? x.personId : "",
            newName: typeof x.newName === "string" ? x.newName : "",
          };
        })
        .filter((r) => r.personId && r.newName.trim())
    : [];
  const tagAssignments = Array.isArray(o.tagAssignments)
    ? o.tagAssignments
        .filter((t): t is Record<string, unknown> => t !== null && typeof t === "object")
        .map((t) => {
          const personId = typeof t.personId === "string" ? t.personId : "";
          const tags = Array.isArray(t.tags)
            ? t.tags.filter((x): x is string => typeof x === "string")
            : [];
          return { personId, tags };
        })
        .filter((t) => t.personId && t.tags.some((x) => x.trim()))
    : [];
  const summary = typeof o.summary === "string" ? o.summary : undefined;
  return { deletePersonIds, mergeGroups, renameOnly, tagAssignments, summary };
}

export async function POST(request: NextRequest) {
  try {
    const persons = getAllPersons();
    if (persons.length === 0) {
      return NextResponse.json({ error: "人物库为空" }, { status: 400 });
    }

    const { apiUrl, apiKey, model } = resolveLlmPreferClientKeyElseOpenCodeGpt(request.headers);
    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { error: "未配置文本模型（请在请求头传入 x-api-url / x-api-key，或配置 OPENCLAUDECODE_* / GEMINI_*）" },
        { status: 500 }
      );
    }

    const compact = persons.map((p) => ({
      id: p.id,
      name: p.name,
      appearances: p.appearances,
      dreamCount: p.dreamIds.length,
      tagsSample: p.tags.slice(0, 6),
      relationshipNotesExcerpt: (p.relationshipNotes[0] ?? "").slice(0, 120),
    }));

    const userContent = PERSON_ORGANIZE_USER_PROMPT(JSON.stringify(compact, null, 2));
    const body = buildLLMRequestBody(
      model,
      [
        { role: "system", content: PERSON_ORGANIZE_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { temperature: 0.2, responseFormat: { type: "json_object" } }
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
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "模型返回空内容" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = parseLLMJson(content);
    } catch {
      return NextResponse.json({ error: "模型返回非合法 JSON", detail: content.slice(0, 500) }, { status: 502 });
    }

    const plan = normalizePlan(parsed);
    if (!plan) {
      return NextResponse.json({ error: "无法解析整理计划" }, { status: 502 });
    }

    const result = executePersonOrganizePlan(plan);
    if (result.error) {
      return NextResponse.json(
        { error: "计划未通过校验", detail: result.error, plan },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      summary: plan.summary ?? "整理完成",
      dreamsUpdated: result.dreamsUpdated,
      plan: result.appliedPlan ?? plan,
    });
  } catch (e) {
    console.error("organize-ai:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
