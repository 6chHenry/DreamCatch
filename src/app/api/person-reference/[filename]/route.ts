import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { personReferenceFilePath } from "@/lib/person-store";
import { getServerDataRoot } from "@/lib/server-data-root";

export const runtime = "nodejs";

function safeFilename(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.includes("..") && name.length < 200;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (!safeFilename(filename)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = personReferenceFilePath(filename);
    const resolved = path.resolve(filePath);
    const base = path.resolve(path.join(getServerDataRoot(), "person-reference"));
    if (!resolved.startsWith(base)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Person reference serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
