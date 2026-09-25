import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { generateForProfile } from "@/lib/store";
import { generateInputSchema } from "@/lib/types";

export const maxDuration = 60;

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = generateInputSchema.parse(await request.json());
    const result = await generateForProfile({
      profileId: id,
      surface: input.surface,
      facts: input.facts,
      seed: input.seed,
      architecture: input.architecture,
      format: input.format,
      model: input.model,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate";
    const missing =
      message.includes("OPENAI_API_KEY") || message.includes("ANTHROPIC_API_KEY");
    return NextResponse.json({ error: message }, { status: missing ? 503 : 400 });
  }
}
