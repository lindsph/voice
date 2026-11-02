import { after, NextResponse } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { DRAFT_VARIANTS } from "@/lib/cleanup";
import { createEvalRun, evalStatus, runEval } from "@/lib/eval";

type Props = { params: Promise<{ id: string }> };

const runSchema = z.object({
  /** Only start when a scheduled run is due (hosts call this from a cron). */
  ifDue: z.boolean().optional(),
  /** Manual runs, and candidate runs that try a change against today's Voice. */
  trigger: z.enum(["manual", "candidate"]).optional(),
  label: z.string().max(200).optional(),
  model: z.string().max(80).optional(),
  /** Candidate runs: a change to drafting to try (see lib/cleanup.ts). */
  variant: z.enum(DRAFT_VARIANTS).optional(),
  /** Candidate runs: the finished run to compare against (default: the last scheduled run). */
  against: z.string().max(40).optional(),
});

/** Start a voice eval run. It finishes in the background; read the result from GET /evals. */
export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = runSchema.parse(await request.json().catch(() => ({})));
    const status = await evalStatus(id);
    if (status.running) {
      return NextResponse.json({ started: false, reason: "running", runId: status.running });
    }
    const trigger = input.ifDue ? status.due : (input.trigger ?? "manual");
    if (!trigger) {
      return NextResponse.json({ started: false, reason: "not-due", caseCount: status.caseCount });
    }
    if (status.caseCount === 0) {
      return NextResponse.json({ started: false, reason: "no-cases" });
    }
    const run = await createEvalRun({ profileId: id, trigger, label: input.label });
    after(() => runEval(run.id, { profileId: id, trigger, label: input.label, model: input.model, variant: input.variant, against: input.against }));
    return NextResponse.json({ started: true, runId: run.id, trigger });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start run";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
