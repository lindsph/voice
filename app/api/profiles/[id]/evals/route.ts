import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { evalStatus } from "@/lib/eval";

type Props = { params: Promise<{ id: string }> };

/** Voice eval status: case count, recent scorecards, and whether a run is due. */
export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json(await evalStatus(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read evals";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
