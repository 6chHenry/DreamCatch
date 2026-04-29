import { NextRequest, NextResponse } from "next/server";
import { llmFetch } from "@/lib/llm-fetch";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 图生视频首帧需公网 URL；中转站常不接受 data: 超长内联。 */
function isHttpPublicImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function videoErrTextSuggestsBadImageField(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("invalid url") && !m.includes("/videos/");
}

function videoErrTextSuggestsRouteUnsupported(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (m.includes("invalid url") && m.includes("videos/generations")) ||
    m.includes("post /v1/videos/generations")
  );
}

export async function POST(request: NextRequest) {
  try {
    const { sceneImageUrls, dreamStructured } = await request.json();

    if (!dreamStructured) {
      return NextResponse.json({ error: "No dream data provided" }, { status: 400 });
    }

    const grokApiUrl = process.env.GROK_API_URL?.replace(/\/$/, "");
    const grokApiKey = process.env.GROK_API_KEY;
    const grokVideoModel = process.env.GROK_VIDEO_MODEL || "grok-imagine-video";
    const videoGenPath =
      process.env.GROK_VIDEO_GENERATIONS_PATH?.replace(/^\/+/, "") || "videos/generations";
    const pollIntervalMs = Math.max(
      1000,
      Number(process.env.GROK_VIDEO_POLL_INTERVAL_MS) || 5000
    );
    const pollTimeoutMs = Math.max(
      60_000,
      Number(process.env.GROK_VIDEO_POLL_TIMEOUT_MS) || 900_000
    );

    if (!grokApiUrl || !grokApiKey) {
      const narrativeSummary = dreamStructured.narrative?.summary || "";
      const sceneDescriptions = (dreamStructured.scenes || [])
        .map((s: { description: string }, i: number) => `场景${i + 1}: ${s.description}`)
        .join("\n");
      const emotionSummary = (dreamStructured.emotions || [])
        .map((e: { type: string; intensity: number }) => `${e.type}(强度${e.intensity})`)
        .join("、");

      return NextResponse.json({
        status: "not_configured",
        message: "视频生成API未配置",
        videoPrompt: `基于以下梦境数据生成一段流畅的梦境视频：\n\n叙事概要：${narrativeSummary}\n\n场景序列：\n${sceneDescriptions}\n\n情绪氛围：${emotionSummary}`,
        sceneImageUrls: sceneImageUrls || [],
      });
    }

    const narrativeSummary = dreamStructured.narrative?.summary || "";
    const sceneDescriptions = (dreamStructured.scenes || [])
      .map((s: { description: string }, i: number) => `场景${i + 1}: ${s.description}`)
      .join("; ");
    const emotionSummary = (dreamStructured.emotions || [])
      .map((e: { type: string; intensity: number }) => `${e.type}`)
      .join(", ");

    const videoPrompt = `A dreamlike cinematic video: ${sceneDescriptions}. Mood: ${emotionSummary}. Narrative: ${narrativeSummary}`;

    const urls: string[] = Array.isArray(sceneImageUrls) ? sceneImageUrls.filter(Boolean) : [];
    const startImageUrl = typeof urls[0] === "string" ? urls[0] : "";
    const canFirstFrame = Boolean(startImageUrl && isHttpPublicImageUrl(startImageUrl));
    if (startImageUrl && !canFirstFrame) {
      console.warn(
        "Video: scene image is not http(s); skipping image-to-video first frame (use hosted URL or text-only)"
      );
    }

    const buildStartBody = (withFirstFrame: boolean): Record<string, unknown> => {
      const b: Record<string, unknown> = {
        model: grokVideoModel,
        prompt: videoPrompt,
        duration: 10,
        aspect_ratio: "16:9",
        resolution: "720p",
      };
      if (withFirstFrame && startImageUrl) {
        b.image = { url: startImageUrl, type: "image_url" };
      }
      return b;
    };

    const postVideoStart = (body: Record<string, unknown>) =>
      llmFetch(`${grokApiUrl}/${videoGenPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${grokApiKey}`,
        },
        body: JSON.stringify(body),
      });

    let startRes = await postVideoStart(buildStartBody(canFirstFrame));
    let errorText = "";

    if (!startRes.ok) {
      errorText = await startRes.text();
      if (canFirstFrame && videoErrTextSuggestsBadImageField(errorText)) {
        console.warn("Video: retrying text-to-video without first-frame image");
        startRes = await postVideoStart(buildStartBody(false));
        if (!startRes.ok) errorText = await startRes.text();
        else errorText = "";
      }
    }

    if (!startRes.ok) {
      console.error("Video generation start error:", errorText);
      const routeUnsupported = videoErrTextSuggestsRouteUnsupported(errorText);
      return NextResponse.json(
        {
          status: "error",
          message: routeUnsupported
            ? "中转站未识别视频生成路径（可能未开放 Grok 视频）"
            : "视频生成失败（提交任务）",
          detail: errorText,
          videoPrompt,
          ...(routeUnsupported
            ? {
                proxyHint:
                  "返回体指向 POST /v1/videos/generations，多为网关未实现 xAI 异步视频接口。请向服务商确认是否支持 grok-imagine-video，或参考 https://docs.x.ai/developers/model-capabilities/video/generation 换用直连/其它兼容地址。也可设置 GROK_VIDEO_GENERATIONS_PATH 若对方文档要求不同子路径。",
              }
            : {}),
        },
        { status: 500 }
      );
    }

    const startJson = (await startRes.json()) as { request_id?: string };
    const requestId = startJson.request_id;
    if (!requestId) {
      console.error("Video generation: missing request_id", startJson);
      return NextResponse.json(
        {
          status: "error",
          message: "视频生成失败（未返回 request_id）",
          detail: JSON.stringify(startJson),
          videoPrompt,
        },
        { status: 500 }
      );
    }

    const deadline = Date.now() + pollTimeoutMs;
    let videoUrl = "";

    while (Date.now() < deadline) {
      const statusRes = await llmFetch(`${grokApiUrl}/videos/${requestId}`, {
        headers: { Authorization: `Bearer ${grokApiKey}` },
      });

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        console.error("Video poll error:", errorText);
        return NextResponse.json(
          {
            status: "error",
            message: "视频生成失败（查询状态）",
            detail: errorText,
            videoPrompt,
          },
          { status: 500 }
        );
      }

      const statusJson = (await statusRes.json()) as {
        status?: string;
        video?: { url?: string };
        error?: { message?: string };
      };

      if (statusJson.status === "done" && statusJson.video?.url) {
        videoUrl = statusJson.video.url;
        break;
      }
      if (statusJson.status === "expired") {
        return NextResponse.json({
          status: "error",
          message: "视频生成已过期",
          videoPrompt,
        });
      }
      if (statusJson.status === "failed") {
        return NextResponse.json({
          status: "error",
          message: "视频生成失败",
          detail: statusJson.error?.message || JSON.stringify(statusJson),
          videoPrompt,
        });
      }

      await sleep(pollIntervalMs);
    }

    if (!videoUrl) {
      return NextResponse.json({
        status: "error",
        message: "视频生成超时",
        videoPrompt,
      });
    }

    return NextResponse.json({
      status: "video_ready",
      videoUrl,
      videoPrompt,
    });
  } catch (error) {
    console.error("Video generation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
