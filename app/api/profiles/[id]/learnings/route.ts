import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { listLearnings } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  return NextResponse.json({ learnings: await listLearnings(id) });
}
