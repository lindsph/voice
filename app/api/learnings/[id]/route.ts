import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { dismissLearning } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json(await dismissLearning(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not dismiss";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
