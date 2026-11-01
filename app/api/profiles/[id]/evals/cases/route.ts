import { NextResponse } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { EvalCaseError, upsertEvalCase } from "@/lib/eval";

type Props = { params: Promise<{ id: string }> };

const caseSchema = z.object({
  sourceId: z.string().min(1).max(200),
  surfaceId: z.string().min(1).max(80),
  finalBody: z.string().min(1).max(60_000),
  facts: z.string().max(120_000).optional(),
  architecture: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  style: z.enum(["plain", "crafted"]).optional(),
});

/** Add or refresh one eval case: what the person published for a piece. */
export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = caseSchema.parse(await request.json());
    return NextResponse.json(await upsertEvalCase({ profileId: id, ...input }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save case";
    const status = error instanceof EvalCaseError ? 422 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
