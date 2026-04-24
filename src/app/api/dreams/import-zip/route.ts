import { NextRequest, NextResponse } from "next/server";
import { createDream } from "@/lib/dream-store";
import { syncPersonsFromDream } from "@/lib/person-store";
import { parseDreamExportZip } from "@/lib/dream-zip-import";

const MAX_BYTES = 80 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 ZIP 文件上传" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "上传的文件为空" }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `ZIP 超过 ${MAX_BYTES / 1024 / 1024}MB 上限` },
        { status: 400 }
      );
    }

    const dream = await parseDreamExportZip(buf);
    createDream(dream);

    if (dream.structured.characters?.length) {
      syncPersonsFromDream(dream, dream.createdAt);
    }

    return NextResponse.json(dream, { status: 201 });
  } catch (error) {
    console.error("import-zip:", error);
    const message = error instanceof Error ? error.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
