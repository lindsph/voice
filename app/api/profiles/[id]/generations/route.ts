import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { listSurfaceDrafts } from "@/lib/generation-log";

type Props = { params: Promise<{ id: string }> };

/** GET ?surface=ad — the host's logged drafts on one surface, for matching its live copy back to them. */
export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const surface = new URL(request.url).searchParams.get("surface")?.trim() ?? "";
  if (!surface) {
    return NextResponse.json({ error: "Add ?surface=" }, { status: 400 });
  }
  const { id } = await params;
  return NextResponse.json({ drafts: await listSurfaceDrafts(id, surface) });
}
