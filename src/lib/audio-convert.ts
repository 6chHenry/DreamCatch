import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

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
  const ffmpegPath = ffmpegStatic;
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
