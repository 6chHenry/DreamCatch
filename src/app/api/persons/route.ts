import { NextRequest, NextResponse } from "next/server";
import { getAllPersons, createPerson } from "@/lib/person-store";
import type { Person } from "@/types/dream";

export async function GET() {
  const persons = getAllPersons();
  return NextResponse.json(persons);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const person: Person = {
      id: body.id || crypto.randomUUID(),
      name: body.name || "",
      appearances: body.appearances || 1,
      firstSeen: body.firstSeen || new Date().toISOString(),
      lastSeen: body.lastSeen || new Date().toISOString(),
      relationships: body.relationships || [],
      dreamIds: body.dreamIds || [],
      referenceImageFilename: body.referenceImageFilename,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: body.updatedAt || new Date().toISOString(),
    };

    createPerson(person);
    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    console.error("Create person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
