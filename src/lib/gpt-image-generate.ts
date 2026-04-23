/**
 * gpt-image-2：优先 OpenAI 兼容的 images/generations（及带参考图时的 images/edits），
 * 失败时再试 chat/completions（部分中转站仅暴露该路径）。
 */

function dataUrlFromB64(b64: string, mime = "image/png"): string {
  return `data:${mime};base64,${b64}`;
}

/** 部分网关把 `b64_json` 填成整段 `data:image/...;base64,...`，不能再套一层前缀。 */
function normalizeImagePayload(b64OrDataUrl: string): string {
  const t = b64OrDataUrl.trim();
  if (t.startsWith("data:image/")) return t;
  return dataUrlFromB64(t);
}

function parseImagesApiData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const row = (data as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];
  if (!row) return "";
  if (row.b64_json) return normalizeImagePayload(row.b64_json);
  if (row.url) return row.url;
  return "";
}

function extractImageFromMessageContent(content: unknown): string | null {
  if (typeof content === "string") {
    const m = content.match(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/i);
    if (m) return m[0];
    const md = content.match(/!\[[^\]]*]\((https?:[^)\s]+)\)/);
    if (md) return md[1];
    return null;
  }
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    if (p.type === "image_url" && p.image_url && typeof p.image_url === "object") {
      const u = (p.image_url as { url?: string }).url;
      if (typeof u === "string" && u) return u;
    }
  }
  return null;
}

function parseChatJsonForImage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown[] }).choices;
  const msg = choices?.[0] && typeof choices[0] === "object" ? (choices[0] as { message?: unknown }).message : undefined;
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { content?: unknown };
  return extractImageFromMessageContent(m.content);
}

/** 解析 chat/completions 的 SSE：取最后一个含图像的 chunk。 */
function parseChatSseForImage(raw: string): string | null {
  let last: string | null = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
      };
      const ch0 = j.choices?.[0];
      const c = ch0?.delta?.content ?? ch0?.message?.content;
      const img = extractImageFromMessageContent(c);
      if (img) last = img;
      const whole = parseChatJsonForImage(j);
      if (whole) last = whole;
    } catch {
      /* ignore line */
    }
  }
  return last;
}

async function tryChatCompletionsImage(base: string, apiKey: string, prompt: string): Promise<string | null> {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      messages: [
        {
          role: "user",
          content: `请根据以下画面描述生成一张图片，只输出图像结果（不要长篇文字说明）：\n\n${prompt}`,
        },
      ],
      max_tokens: 4096,
      stream: false,
    }),
  });

  const text = await r.text();
  if (!r.ok) return null;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("text/event-stream") || text.trimStart().startsWith("data:")) {
    return parseChatSseForImage(text);
  }
  try {
    const data = JSON.parse(text) as unknown;
    return parseChatJsonForImage(data);
  } catch {
    return parseChatSseForImage(text);
  }
}

export async function generateGptImage2SceneImage(opts: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  refPngBuffer?: Buffer;
}): Promise<{ imageUrl: string } | { error: string }> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  if (opts.refPngBuffer && opts.refPngBuffer.length > 0) {
    const form = new FormData();
    form.set("model", "gpt-image-2");
    form.set("prompt", opts.prompt);
    form.set("size", "1536x1024");
    form.set(
      "image",
      new Blob([new Uint8Array(opts.refPngBuffer)], { type: "image/png" }),
      "ref.png"
    );
    const editRes = await fetch(`${base}/images/edits`, { method: "POST", headers: auth, body: form });
    if (editRes.ok) {
      const data = (await editRes.json()) as unknown;
      const url = parseImagesApiData(data);
      if (url) return { imageUrl: url };
    } else {
      const err = await editRes.text();
      console.warn("gpt-image-2 /images/edits:", editRes.status, err.slice(0, 300));
    }
  }

  const genRes = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: opts.prompt,
      n: 1,
      size: "1536x1024",
      response_format: "b64_json",
    }),
  });

  if (genRes.ok) {
    const data = (await genRes.json()) as unknown;
    const url = parseImagesApiData(data);
    if (url) return { imageUrl: url };
    return { error: "images/generations 成功但未解析到图片数据" };
  }

  const genErr = await genRes.text();
  console.warn("gpt-image-2 /images/generations:", genRes.status, genErr.slice(0, 400));

  const fromChat = await tryChatCompletionsImage(base, opts.apiKey, opts.prompt);
  if (fromChat) return { imageUrl: fromChat };

  return { error: genErr.slice(0, 800) || "GPT Image 2 生成失败" };
}
