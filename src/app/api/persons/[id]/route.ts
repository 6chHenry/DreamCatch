import { NextRequest, NextResponse } from "next/server";
import { getPersonById, updatePerson, deletePerson } from "@/lib/person-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const person = getPersonById(id);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json(person, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const updated = updatePerson(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deletePerson(id);
  if (!deleted) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
