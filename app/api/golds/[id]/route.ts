import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { updateGold } from "@/lib/store";
import { goldUpdateSchema } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = goldUpdateSchema.parse(await request.json());
    return NextResponse.json(await updateGold(id, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update";
    const missing = message.startsWith("Unknown gold");
    return NextResponse.json({ error: message }, { status: missing ? 404 : 400 });
  }
}
