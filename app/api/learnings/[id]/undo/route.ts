import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { undoRuleChange } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

/** Undo an automatic rule change (blocked, merged or replaced). */
export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json({ undone: await undoRuleChange(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not undo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
