import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { generateErrorStatus, publicDraftError } from "@/lib/generate-error";
import { ShopifyExcerptRejected, ShopifyHeadlineRejected } from "@/lib/generate";
import { generateForProfile } from "@/lib/store";
import { generateInputSchema } from "@/lib/types";

/** Two 4-minute Claude tries, with room to return the error. */
export const maxDuration = 600;

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
      task: input.task,
      model: input.model,
      style: input.style,
      guide: input.guide,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ShopifyHeadlineRejected || error instanceof ShopifyExcerptRejected) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Could not generate";
    // The raw reply is for the operator's logs, never the person drafting.
    console.error(`[generate] ${message}`);
    return NextResponse.json(
      { error: publicDraftError(error, message) },
      { status: generateErrorStatus(error, message) },
    );
  }
}
