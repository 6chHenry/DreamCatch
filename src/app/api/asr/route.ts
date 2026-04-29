import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { llmFetch } from "@/lib/llm-fetch";
import { shouldTranscodeToWavForDoubao, transcodeBufferToWavPcm16kMono } from "@/lib/audio-convert";
import { getServerDataRoot } from "@/lib/server-data-root";

export const runtime = "nodejs";

/** 火山引擎「大模型录音文件极速版」单次识别，见 https://www.volcengine.com/docs/6561/1631584?lang=zh */
const DOUBAO_FLASH_RECOGNIZE_URL =
  process.env.DOUBAO_SPEECH_FLASH_URL?.trim() ||
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";

const DOUBAO_RESOURCE_TURBO = "volc.bigasr.auc_turbo";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const ext = extFromAudioFile(audioFile);
    const audioId = crypto.randomUUID();
    const audioFileName = `${audioId}.${ext}`;

    const audioDir = path.join(getServerDataRoot(), "audio");
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    fs.writeFileSync(path.join(audioDir, audioFileName), buffer);

    let asrBuffer = buffer;
    if (shouldTranscodeToWavForDoubao(ext, audioFile.type || "")) {
      try {
        asrBuffer = Buffer.from(await transcodeBufferToWavPcm16kMono(buffer, ext));
      } catch (transcodeErr) {
        console.error("ASR transcode error:", transcodeErr);
        throw new Error(
          `音频转 WAV 失败：${transcodeErr instanceof Error ? transcodeErr.message : String(transcodeErr)}。请确认已安装依赖 ffmpeg-static，或改用 mp3/wav 上传。`
        );
      }
    }

    let asrResult: { text: string; segments: { start: number; end: number; text: string }[]; dreamSegments: { start: number; end: number; text: string }[] };

    try {
      asrResult = await doubaoFlashASR(asrBuffer);
    } catch (doubaoError) {
      const msg = doubaoError instanceof Error ? doubaoError.message : String(doubaoError);
      const geminiReady =
        Boolean(process.env.GEMINI_API_URL?.trim()) &&
        Boolean(process.env.GEMINI_API_KEY?.trim()) &&
        Boolean(process.env.GEMINI_MODEL?.trim());

      if (geminiReady) {
        console.warn("Doubao Speech flash failed, trying Gemini:", msg);
        try {
          asrResult = await geminiASR(buffer, ext);
        } catch (geminiErr) {
          console.error("ASR failed. Doubao:", doubaoError, "Gemini:", geminiErr);
          throw new Error(
            `语音识别失败：豆包 ${msg}。若录音为 WebM，请在支持 OGG Opus 的浏览器重试，或配置 GEMINI_* 作为备用。`
          );
        }
      } else {
        console.error("Doubao Speech flash failed (no Gemini fallback):", doubaoError);
        throw new Error(
          `${msg}（请检查豆包语音鉴权与 volc.bigasr.auc_turbo；m4a/webm 等已自动转 WAV 再识别）`
        );
      }
    }

    return NextResponse.json({
      ...asrResult,
      audioFileName,
    });
  } catch (error) {
    console.error("ASR error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

function extFromAudioFile(file: File): string {
  const mime = (file.type || "").toLowerCase();
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") || mime.includes("x-caf")) return "m4a";
  const name = file.name || "";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && ["ogg", "wav", "mp3", "webm", "m4a", "aac", "caf", "mp4", "flac", "opus"].includes(ext)) {
    if (ext === "mp4" && mime.includes("audio")) return "m4a";
    return ext;
  }
  return "webm";
}

/**
 * 新版控制台：X-Api-Key + Resource-Id。
 * 旧版控制台：设置 DOUBAO_SPEECH_LEGACY_APP_KEY + DOUBAO_SPEECH_LEGACY_ACCESS_KEY 时使用 X-Api-App-Key / X-Api-Access-Key。
 */
async function doubaoFlashASR(buffer: Buffer): Promise<{
  text: string;
  segments: { start: number; end: number; text: string }[];
  dreamSegments: { start: number; end: number; text: string }[];
}> {
  const apiKey = process.env.DOUBAO_SPEECH_API_KEY?.trim();
  const legacyApp = process.env.DOUBAO_SPEECH_LEGACY_APP_KEY?.trim();
  const legacyAccess = process.env.DOUBAO_SPEECH_LEGACY_ACCESS_KEY?.trim();
  const uid = process.env.DOUBAO_SPEECH_UID?.trim() || apiKey || legacyApp;

  if (!legacyApp && !apiKey) {
    throw new Error("Doubao Speech 未配置：请在 .env.local 设置 DOUBAO_SPEECH_API_KEY（新版控制台 App Key）");
  }
  if (legacyApp && !legacyAccess) {
    throw new Error("旧版控制台需同时设置 DOUBAO_SPEECH_LEGACY_APP_KEY 与 DOUBAO_SPEECH_LEGACY_ACCESS_KEY");
  }

  const base64Audio = buffer.toString("base64");
  const requestId = crypto.randomUUID();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": DOUBAO_RESOURCE_TURBO,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  };

  if (legacyApp && legacyAccess) {
    headers["X-Api-App-Key"] = legacyApp;
    headers["X-Api-Access-Key"] = legacyAccess;
  } else {
    headers["X-Api-Key"] = apiKey!;
  }

  const response = await fetch(DOUBAO_FLASH_RECOGNIZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: { uid: uid || "dreamcup" },
      audio: { data: base64Audio },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
      },
    }),
  });

  const statusCode = response.headers.get("X-Api-Status-Code") || "";
  const statusMsg = response.headers.get("X-Api-Message") || "";
  const logId = response.headers.get("X-Tt-Logid") || "";

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    const t = await response.text().catch(() => "");
    throw new Error(`豆包识别响应非 JSON。HTTP ${response.status} ${statusCode} ${statusMsg} logid=${logId} ${t.slice(0, 200)}`);
  }

  if (statusCode === "20000003") {
    return { text: "", segments: [], dreamSegments: [] };
  }

  if (statusCode !== "20000000") {
    throw new Error(
      `豆包识别失败 X-Api-Status-Code=${statusCode} ${statusMsg} logid=${logId} body=${JSON.stringify(body).slice(0, 500)}`
    );
  }

  const result = body.result as Record<string, unknown> | undefined;
  const text = (result?.text as string)?.trim() ?? "";

  if (!text) {
    return { text: "", segments: [], dreamSegments: [] };
  }

  const utterances = result?.utterances as Array<{ start_time?: number; end_time?: number; text?: string }> | undefined;
  let segments: { start: number; end: number; text: string }[];

  if (utterances?.length) {
    segments = utterances
      .filter((u) => u.text?.trim())
      .map((u) => ({
        start: (u.start_time ?? 0) / 1000,
        end: (u.end_time ?? 0) / 1000,
        text: (u.text || "").trim(),
      }));
  } else {
    segments = text
      .split(/\n+/)
      .filter((s) => s.trim())
      .map((t, i) => ({
        start: i * 3,
        end: (i + 1) * 3,
        text: t.trim(),
      }));
  }

  return {
    text,
    segments,
    dreamSegments: splitDreamSegments(segments),
  };
}

async function geminiASR(buffer: Buffer, ext: string) {
  const apiUrl = process.env.GEMINI_API_URL;
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  if (!apiUrl || !apiKey || !model) {
    throw new Error("Gemini API not configured");
  }

  const base64Audio = buffer.toString("base64");
  const mimeType =
    ext === "webm" ? "audio/webm" : ext === "mp3" ? "audio/mp3" : ext === "ogg" ? "audio/ogg" : "audio/wav";

  const response = await llmFetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please transcribe the following audio into text. Output only the transcribed text, no explanations or labels. If there is no speech, output nothing.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Audio}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini ASR failed: ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  if (!text.trim()) {
    throw new Error("Gemini ASR returned empty text");
  }

  const segments = text
    .split(/\n+/)
    .filter((s: string) => s.trim())
    .map((t: string, i: number) => ({
      start: i * 3,
      end: (i + 1) * 3,
      text: t.trim(),
    }));

  return {
    text,
    segments,
    dreamSegments: splitDreamSegments(segments),
  };
}

function splitDreamSegments(
  segments: { start: number; end: number; text: string }[]
): { start: number; end: number; text: string }[] {
  if (segments.length === 0) return [];

  const dreamSegments: { start: number; end: number; text: string }[] = [];
  let currentSegment = {
    start: segments[0].start,
    end: segments[0].end,
    text: segments[0].text,
  };

  const GAP_THRESHOLD = 2.0;

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > GAP_THRESHOLD) {
      dreamSegments.push(currentSegment);
      currentSegment = {
        start: segments[i].start,
        end: segments[i].end,
        text: segments[i].text,
      };
    } else {
      currentSegment.end = segments[i].end;
      currentSegment.text += segments[i].text;
    }
  }

  dreamSegments.push(currentSegment);
  return dreamSegments;
}
