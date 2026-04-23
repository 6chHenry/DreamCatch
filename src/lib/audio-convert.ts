import { execFile } from "child_process";
import { createRequire } from "node:module";
import { randomUUID } from "crypto";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * ffmpeg-static 默认用 `__dirname` 拼二进制路径；被 Turbopack/Webpack 打进 chunk 后
 * `__dirname` 会变成虚拟路径（如 \\ROOT\\node_modules\\...），spawn 报 ENOENT。
 * 从项目根 `package.json` 创建 require，让包内 `__dirname` 指向真实磁盘上的 node_modules。
 */
function resolveFfmpegBinaryPath(): string | null {
  if (process.env.FFMPEG_BIN?.trim()) {
    return process.env.FFMPEG_BIN.trim();
  }
  try {
    const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
    return requireFromProject("ffmpeg-static") as string | null;
  } catch {
    return null;
  }
}

/** 豆包极速版明确支持 WAV / MP3 / OGG OPUS；其余（m4a、webm 等）先转码再送识别。 */
export function shouldTranscodeToWavForDoubao(ext: string, mime: string): boolean {
  const e = (ext || "").replace(/^\./, "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (["wav", "mp3", "ogg"].includes(e)) return false;
  if (m.includes("audio/wav") || m.includes("audio/wave")) return false;
  if (m.includes("audio/mpeg") || m.includes("audio/mp3")) return false;
  if (m.includes("audio/ogg")) return false;
  return true;
}

/** 转为 16kHz 单声道 PCM WAV，与常见语音识别输入一致。 */
export async function transcodeBufferToWavPcm16kMono(input: Buffer, inputExt: string): Promise<Buffer> {
  const ffmpegPath = resolveFfmpegBinaryPath();
  if (!ffmpegPath) {
    throw new Error("未找到 ffmpeg 可执行文件（ffmpeg-static）。请执行 npm install。");
  }

  const id = randomUUID();
  let safeExt = (inputExt || "bin").replace(/[^a-z0-9]/gi, "");
  if (!safeExt) safeExt = "bin";
  const inPath = path.join(os.tmpdir(), `dreamcup-asr-in-${id}.${safeExt}`);
  const outPath = path.join(os.tmpdir(), `dreamcup-asr-out-${id}.wav`);

  await fs.writeFile(inPath, input);
  try {
    await execFileAsync(
      ffmpegPath,
      ["-y", "-i", inPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outPath],
      { maxBuffer: 80 * 1024 * 1024 }
    );
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}
