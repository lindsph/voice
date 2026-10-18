import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { LearnModelError } from "@/lib/infer";
import { learnForProfile } from "@/lib/store";
import { learnInputSchema } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = learnInputSchema.parse(await request.json());
    return NextResponse.json(
      await learnForProfile({
        profileId: id,
        ...input,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not learn";
    // A model failure is retryable on the host; bad input is not.
    const status = error instanceof LearnModelError ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
