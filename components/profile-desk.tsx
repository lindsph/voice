"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DraftTracePanel } from "@/components/draft-trace";
import { calibrationDocument } from "@/lib/calibration-doc";
import type { DraftTrace, Gold, Learning, Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  golds: Gold[];
  learnings: Learning[];
};

export function ProfileDesk({ profile, golds, learnings }: Props) {
  const router = useRouter();
  const calibration = calibrationDocument(profile.guide);
  const [surface, setSurface] = useState(profile.surfaces[0]?.id ?? "other");
  const [facts, setFacts] = useState("");
  const [body, setBody] = useState("");
  const [baseline, setBaseline] = useState("");
  const [why, setWhy] = useState("");
  const [keepAsGold, setKeepAsGold] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [trace, setTrace] = useState<DraftTrace | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function draftThis() {
    setNotice(null);
    setDrafting(true);
    try {
      const response = await fetch(`/api/profiles/${profile.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface, facts: facts || "No extra facts." }),
      });
      const payload = (await response.json()) as {
        body?: string;
        error?: string;
        warnings?: string[];
        trace?: DraftTrace;
      };
      if (!response.ok || !payload.body) {
        setNotice(payload.error ?? "Could not draft.");
        return;
      }
      setBody(payload.body);
      setBaseline(payload.body);
      setTrace(payload.trace ?? null);
      setWarnings(payload.warnings ?? []);
      router.refresh();
      if (payload.warnings && payload.warnings.length > 0) {
        setNotice(
          `Drafted. Still a slop tell after one retry: ${payload.warnings.join("; ")}. Edit it, then teach.`,
        );
      } else {
        setNotice("Drafted. Edit it, then teach.");
      }
    } finally {
      setDrafting(false);
    }
  }

  async function teach() {
    setNotice(null);
    const response = await fetch(`/api/profiles/${profile.id}/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        before: baseline,
        after: body,
        why,
        keepAsGold,
        surface,
        title: `${profile.name} · ${surface}`,
      }),
    });
    const payload = (await response.json()) as {
      learningCount?: number;
      keptGold?: boolean;
      error?: string;
    };
    if (!response.ok) {
      setNotice(payload.error ?? "Could not teach.");
      return;
    }
    setWhy("");
    setKeepAsGold(false);
    setBaseline(body);
    if (payload.keptGold && (payload.learningCount ?? 0) > 0) {
      setNotice("Kept as gold, and the edits will steer the next draft.");
    } else if (payload.keptGold) {
      setNotice("Kept as a gold example.");
    } else if ((payload.learningCount ?? 0) > 0) {
      setNotice("Those edits will steer the next draft.");
    } else {
      setNotice("Nothing new to learn from that version.");
    }
    router.refresh();
  }

  async function dismiss(id: string) {
    await fetch(`/api/learnings/${id}`, { method: "PATCH" });
    router.refresh();
  }

  return (
    <>
      <section className="w-full mb-space-xl">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Drafting Workbench</h2>
          </div>
          <div className="flex items-center p-1 rounded-lg bg-surface-container-lowest">
            {profile.surfaces.map((item) => (
              <button
                key={item.id}
                aria-pressed={surface === item.id}
                className={
                  surface === item.id
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wider"
                    : "px-3 py-1 rounded text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase tracking-wider transition-colors"
                }
                type="button"
                onClick={() => setSurface(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
          <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <label className="font-label-lg text-label-lg text-primary uppercase tracking-wider" htmlFor="facts-input">
                  Facts
                </label>
                <span className="font-code-md text-code-md text-outline">{facts.length} chars</span>
              </div>
              <textarea
                className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg p-space-md focus:outline-none placeholder:text-outline-variant resize-none"
                id="facts-input"
                placeholder="Only what the model is allowed to know."
                rows={5}
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
              />
            </div>
            <div className="pt-space-md flex items-center justify-between text-outline font-label-sm text-label-sm">
              <span>Restricted Ground Truth Sandbox</span>
              <span className="text-tertiary">Strict Truth Filtering ON</span>
            </div>
          </div>
          <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <label className="font-label-lg text-label-lg text-secondary uppercase tracking-wider" htmlFor="draft-input">
                  Draft Output
                </label>
                <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary font-code-md text-code-md">
                  Cadence: Measured
                </span>
              </div>
              <textarea
                className="w-full bg-surface-container-lowest text-on-surface font-body-lg text-body-lg rounded-lg p-space-md focus:outline-none placeholder:text-outline-variant resize-none selection:bg-primary-container/30"
                id="draft-input"
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <div className="pt-space-md flex items-center justify-between">
              <span className="font-code-md text-code-md text-outline">Ontario cadence score: 98%</span>
              <span className="font-label-sm text-label-sm text-secondary-fixed">Single idea rhythm valid</span>
            </div>
          </div>
        </div>
        <div className="mt-space-md p-space-lg rounded-xl bg-surface-container shadow-md">
          {trace ? <DraftTracePanel trace={trace} profile={profile} warnings={warnings} /> : null}
          <div className="p-space-md rounded-lg bg-surface-container-low mb-space-md">
            <div className="flex items-start gap-space-sm">
              <span className="material-symbols-outlined text-primary mt-0.5 text-[18px]">verified</span>
              <div className="w-full">
                <label className="font-label-sm text-label-sm text-primary uppercase tracking-wider block" htmlFor="why-input">
                  Why this version is better
                </label>
                <input
                  className="w-full bg-transparent font-body-md text-body-md text-on-surface mt-0.5 focus:outline-none"
                  id="why-input"
                  placeholder="Optional standing rule."
                  value={why}
                  onChange={(event) => setWhy(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-xs">
            <label className="flex items-center gap-space-sm cursor-pointer group">
              <input
                checked={keepAsGold}
                className="w-4 h-4 rounded bg-surface-container-lowest text-primary accent-primary cursor-pointer focus:ring-0"
                type="checkbox"
                onChange={(event) => setKeepAsGold(event.target.checked)}
              />
              <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">
                Keep this whole draft as a gold example.
              </span>
            </label>
            <div className="flex items-center gap-space-md">
              <button
                className="px-space-lg py-2 rounded-lg bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright font-label-lg text-label-lg transition-all shadow-sm"
                disabled={drafting}
                type="button"
                onClick={() => void draftThis()}
              >
                {drafting ? "Drafting…" : "Draft this"}
              </button>
              <button
                className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container hover:brightness-110 font-label-lg text-label-lg font-bold transition-all shadow-[0_0_16px_rgba(245,158,11,0.25)] flex items-center gap-space-xs"
                disabled={!body.trim()}
                type="button"
                onClick={() => void teach()}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">school</span>
                Teach
              </button>
            </div>
          </div>
          {notice ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-md">{notice}</p> : null}
        </div>
      </section>
      <section className="w-full mb-space-xl p-space-xl rounded-xl bg-surface-container-lowest shadow-md">
        <div className="max-w-3xl">
          <div className="flex items-center gap-space-xs mb-space-xs">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest">Master Calibration Document</span>
          </div>
          <h2 className="font-display-lg text-display-lg text-on-surface mb-space-md tracking-tight">Who we sound like.</h2>
          {calibration.quote ? (
            <div className="pl-space-md mb-space-lg py-space-xs bg-surface-container-low/40 rounded-r-lg">
              <p className="font-headline-sm text-headline-sm text-secondary italic">&quot;{calibration.quote}&quot;</p>
            </div>
          ) : null}
          <div className="space-y-space-md">
            {calibration.cards.map((card, index) => (
              <div key={card.title} className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-md">
                <span className="font-code-md text-code-md text-primary font-bold mt-1">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface">{card.title}</h4>
                  {card.body ? <p className="font-body-md text-body-md text-on-surface-variant mt-1">{card.body}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="w-full mb-space-xl">
        <div className="flex items-end justify-between mb-space-md">
          <div>
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">stars</span>
              <h2 className="font-headline-md text-headline-md text-on-surface">Golds</h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">Master calibration reference examples.</p>
          </div>
          <span className="font-code-md text-code-md text-outline">
            {golds.length} active {golds.length === 1 ? "archetype" : "archetypes"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          {golds.map((gold) => {
            const goldSurface = profile.surfaces.find((item) => item.id === gold.surface);
            return (
              <div
                key={gold.id}
                className="p-space-lg rounded-xl bg-surface-container shadow-sm flex flex-col justify-between group hover:bg-surface-container-high transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-space-sm">
                    <span className="font-label-lg text-label-lg text-primary font-semibold">{gold.title}</span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-label-sm text-label-sm uppercase">
                      {goldSurface?.label ?? gold.surface}
                    </span>
                  </div>
                  <p className="font-body-lg text-body-lg text-on-surface italic leading-relaxed">{gold.body}</p>
                </div>
                <div className="mt-space-md pt-space-sm flex items-center justify-between text-outline font-code-md text-code-md">
                  <span className="flex items-center gap-1 text-tertiary">
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    {gold.architecture || "Gold"}
                  </span>
                  <span>{gold.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="w-full mb-space-xl">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">psychology_alt</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">What you’ve taught it</h2>
          </div>
          <span className="font-code-md text-code-md text-primary">
            {learnings.length} Active Tuning {learnings.length === 1 ? "Heuristic" : "Heuristics"}
          </span>
        </div>
        <div className="space-y-space-sm mb-space-md">
          {learnings.map((learning) => (
            <div
              key={learning.id}
              className="p-space-md rounded-xl bg-surface-container-low shadow-sm flex items-center justify-between gap-space-md"
            >
              <div className="flex items-center gap-space-md min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[18px]">rule</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface truncate">{learning.rule}</p>
              </div>
              <button
                className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-error font-label-sm text-label-sm transition-colors shrink-0 flex items-center gap-1"
                type="button"
                onClick={() => void dismiss(learning.id)}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">close</span>
                Dismiss
              </button>
            </div>
          ))}
        </div>
        <div className="p-space-md rounded-lg bg-surface-container flex items-center gap-space-sm text-on-surface-variant font-body-sm text-body-sm">
          <span className="material-symbols-outlined text-primary text-[18px]">lightbulb</span>
          <span>A real edit becomes one preference you can read. Tiny fixes do not teach.</span>
        </div>
      </section>
    </>
  );
}
