import { NextRequest, NextResponse } from "next/server";
import type { Dream } from "@/types/dream";
import { getDreamById, updateDream, unhideDreamFromJournal } from "@/lib/dream-store";
import { syncPersonsFromDream } from "@/lib/person-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dream = getDreamById(id);
  if (!dream) {
    return NextResponse.json({ error: "Dream not found" }, { status: 404 });
  }
  return NextResponse.json(dream);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown> & { showInJournal?: boolean };
    if (body?.showInJournal === true) {
      const restored = unhideDreamFromJournal(id);
      if (!restored) {
        return NextResponse.json({ error: "Dream not found" }, { status: 404 });
      }
      if (restored.structured?.characters?.length) {
        syncPersonsFromDream(restored, restored.updatedAt);
      }
      return NextResponse.json(restored);
    }
    const { showInJournal: _s, ...patch } = body;
    const updated = updateDream(id, patch as Partial<Dream>);
    if (!updated) {
      return NextResponse.json({ error: "Dream not found" }, { status: 404 });
    }
    if (updated.structured?.characters?.length && !updated.deletedAt) {
      syncPersonsFromDream(updated, updated.updatedAt);
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update dream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = getDreamById(id);
  if (!existing) {
    return NextResponse.json({ error: "Dream not found" }, { status: 404 });
  }
  if (existing.deletedAt) {
    return NextResponse.json({ success: true, hiddenFromJournal: true, alreadyHidden: true });
  }
  updateDream(id, { deletedAt: new Date().toISOString() });
  return NextResponse.json({
    success: true,
    hiddenFromJournal: true,
    message: "已从日志列表移除，梦境 JSON 与资源仍保留在本地 data 中",
  });
}
