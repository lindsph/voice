import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { listProfiles } from "@/lib/store";

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ profiles: await listProfiles() });
}
