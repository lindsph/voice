import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { listRuleChanges } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

/** What the rule check changed recently (?days=7 by default, up to 90). */
export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const raw = Number(new URL(request.url).searchParams.get("days") ?? 7);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 90) : 7;
  return NextResponse.json({ changes: await listRuleChanges(id, days) });
}
