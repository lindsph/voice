import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { getBundle } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const surface = url.searchParams.get("surface") ?? "other";
    const seed = url.searchParams.get("seed") ?? undefined;
    const facts = url.searchParams.get("facts") ?? undefined;
    const corpus = await getBundle({ profileId: id, surface, seed, facts });
    return NextResponse.json({
      bundle: corpus.bundle,
      profile: {
        id: corpus.profile.id,
        name: corpus.profile.name,
        guide: corpus.profile.guide,
      },
      golds: corpus.golds,
      learnings: corpus.learnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build bundle";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
