import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAllDreams, createDream } from "@/lib/dream-store";
import { syncPersonsFromDream } from "@/lib/person-store";
import type { Dream } from "@/types/dream";

export async function GET() {
  const allDreams = getAllDreams();
  return NextResponse.json(allDreams);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const dream: Dream = {
      id: body.id || uuidv4(),
      title: body.title || "未命名梦境",
      rawText: body.rawText || "",
      structured: body.structured || {
        scenes: [],
        characters: [],
        narrative: { events: [], summary: "" },
        emotions: [],
        sensory: {},
        anomalies: [],
        meta: {},
        lowConfidence: [],
      },
      audioUrl: body.audioUrl,
      audioFileName: body.audioFileName,
      scenes: body.scenes || [],
      sceneRenderPrompts: body.sceneRenderPrompts,
      videoUrl: body.videoUrl,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: body.updatedAt || new Date().toISOString(),
    };

    createDream(dream);

    if (dream.structured.characters?.length > 0) {
      syncPersonsFromDream(dream, dream.createdAt);
    }

    return NextResponse.json(dream, { status: 201 });
  } catch (error) {
    console.error("Create dream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
