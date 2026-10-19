import { NextResponse } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { syncGoldSet } from "@/lib/store";

const bodySchema = z.object({
  surface: z.string().min(1),
  /** Names the set. Only golds with exactly this source are added, retitled or dismissed. */
  source: z.string().min(8).max(200),
  items: z
    .array(z.object({ body: z.string().min(1).max(4000), title: z.string().max(200) }))
    .max(200),
});

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = bodySchema.parse(await request.json());
    return NextResponse.json(await syncGoldSet({ profileId: id, ...input }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync golds";
    const status = /unknown profile/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
