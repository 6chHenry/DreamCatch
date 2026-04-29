import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { getServerDataRoot } from "@/lib/server-data-root";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const audioDir = path.join(getServerDataRoot(), "audio");
    const filePath = path.join(audioDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Audio file not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "webm" ? "audio/webm" :
      ext === "mp3" ? "audio/mpeg" :
      ext === "wav" ? "audio/wav" :
      ext === "ogg" ? "audio/ogg" :
      ext === "m4a" || ext === "aac" || ext === "mp4" ? "audio/mp4" :
      ext === "caf" ? "audio/x-caf" :
      ext === "flac" ? "audio/flac" :
      "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Audio serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
