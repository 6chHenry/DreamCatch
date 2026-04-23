import { NextRequest, NextResponse } from "next/server";
import { getDreamById, updateDream, deleteDream } from "@/lib/dream-store";
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
    const body = await request.json();
    const updated = updateDream(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Dream not found" }, { status: 404 });
    }
    if (updated.structured?.characters?.length) {
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
  const deleted = deleteDream(id);
  if (!deleted) {
    return NextResponse.json({ error: "Dream not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
