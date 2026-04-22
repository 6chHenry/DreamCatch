import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import crypto from "crypto";
import {
  ensurePersonReferenceDir,
  getPersonById,
  personReferenceFilePath,
  updatePerson,
} from "@/lib/person-store";

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFromMime(m: string): string {
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "bin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const person = getPersonById(id);
    if (!person) {
      return NextResponse.json({ error: "人物不存在" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
    }

    const mime = file.type || "";
    if (!ALLOWED.has(mime)) {
      return NextResponse.json({ error: "仅支持 JPEG、PNG、WebP、GIF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不超过 8MB" }, { status: 400 });
    }

    ensurePersonReferenceDir();
    const filename = `${crypto.randomUUID()}.${extFromMime(mime)}`;
    fs.writeFileSync(personReferenceFilePath(filename), buffer);

    const updated = updatePerson(id, { referenceImageFilename: filename });
    if (!updated) {
      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Reference image upload error:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const person = getPersonById(id);
    if (!person) {
      return NextResponse.json({ error: "人物不存在" }, { status: 404 });
    }

    const updated = updatePerson(id, { referenceImageFilename: undefined });
    if (!updated) {
      return NextResponse.json({ error: "更新失败" }, { status: 500 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Reference image delete error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
