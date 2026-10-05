import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { updateGenerationOutcome } from "@/lib/generation-log";
import { generationReviewSchema } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = generationReviewSchema.parse(await request.json());
    return NextResponse.json(await updateGenerationOutcome(id, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update";
    const missing = message.startsWith("Unknown generation");
    return NextResponse.json({ error: message }, { status: missing ? 404 : 400 });
  }
}
