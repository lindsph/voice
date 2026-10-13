import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { ShopifyHeadlineRejected } from "@/lib/generate";
import { generateForProfile } from "@/lib/store";
import { generateInputSchema } from "@/lib/types";

/** Two 4-minute Claude tries, with room to return the error. */
export const maxDuration = 600;

type Props = { params: Promise<{ id: string }> };

export function generateErrorStatus(error: unknown, message: string): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  if (message.includes("OPENAI_API_KEY") || message.includes("ANTHROPIC_API_KEY")) {
    return 503;
  }
  return 400;
}

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
      task: input.task,
      model: input.model,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ShopifyHeadlineRejected) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Could not generate";
    return NextResponse.json({ error: message }, { status: generateErrorStatus(error, message) });
  }
}
