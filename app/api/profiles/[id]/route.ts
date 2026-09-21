import { NextResponse } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { getProfile, updateGuide } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json(await getProfile(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown profile";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = z.object({ guide: z.string().min(1) }).parse(await request.json());
    return NextResponse.json(await updateGuide(id, body.guide));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
