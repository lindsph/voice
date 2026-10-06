"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DraftTracePanel } from "@/components/draft-trace";
import { HerWritingForm } from "@/components/her-writing-form";
import { calibrationDocument } from "@/lib/calibration-doc";
import type { DraftTrace, Gold, Learning, Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  golds: Gold[];
  learnings: Learning[];
  draftCounts?: Record<string, number>;
};

export function ProfileDesk({ profile, golds, learnings, draftCounts = {} }: Props) {
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
  const [goldQuery, setGoldQuery] = useState("");
  const [goldFilter, setGoldFilter] = useState("all");
  const [selectedGoldId, setSelectedGoldId] = useState<string | null>(null);
  const [goldEdits, setGoldEdits] = useState<Record<string, Gold>>({});

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

  async function saveGold(id: string, patch: { canonical?: boolean; body?: string; surface?: string; architecture?: string }): Promise<boolean> {
    setNotice(null);
    const response = await fetch(`/api/golds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<Gold> & { error?: string };
    if (!response.ok || !payload.id) {
      setNotice(payload.error ?? "Could not update that gold.");
      return false;
    }
    setGoldEdits((current) => ({ ...current, [payload.id as string]: payload as Gold }));
    router.refresh();
    return true;
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
              <div className="flex items-center justify-between mb-space-sm min-h-8">
                <label className="font-label-lg text-label-lg text-primary uppercase tracking-wider" htmlFor="facts-input">
                  Facts
                </label>
                <span className="font-code-md text-code-md text-outline">{facts.length} chars</span>
              </div>
              <textarea
                className="h-44 w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg p-space-md focus:outline-none placeholder:text-outline-variant resize-none"
                id="facts-input"
                placeholder="Only what the model is allowed to know."
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
              />
            </div>
          </div>
          <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-sm min-h-8">
                <label className="font-label-lg text-label-lg text-secondary uppercase tracking-wider" htmlFor="draft-input">
                  Draft Output
                </label>
                <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary font-code-md text-code-md">
                  Cadence: Measured
                </span>
              </div>
              <textarea
                className="h-44 w-full bg-surface-container-lowest text-on-surface font-body-lg text-body-lg rounded-lg p-space-md focus:outline-none placeholder:text-outline-variant resize-none selection:bg-primary-container/30"
                id="draft-input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
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
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest">Voice guide</span>
          </div>
          <h2 className="font-display-lg text-display-lg text-on-surface mb-space-md tracking-tight">Who we sound like.</h2>
          {calibration.quote ? (
            <p className="font-headline-sm text-headline-sm text-on-surface italic mb-space-lg">&quot;{calibration.quote}&quot;</p>
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
      <HerWritingForm profile={profile} />
      <GoldsLibrary
        golds={golds.map((gold) => goldEdits[gold.id] ?? gold)}
        profile={profile}
        onSaveGold={saveGold}
        draftCounts={draftCounts}
        query={goldQuery}
        selectedId={selectedGoldId}
        filter={goldFilter}
        onQuery={setGoldQuery}
        onSelect={setSelectedGoldId}
        onFilter={setGoldFilter}
      />
      <section className="w-full mb-space-xl">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[20px]">lightbulb</span>
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
                <div
                  aria-label={teachingKindLabel(learning.kind)}
                  className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0"
                  role="img"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{teachingIcon(learning.kind)}</span>
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

function teachingIcon(kind: Learning["kind"]): string {
  return kind === "voice" ? "block" : "rule";
}

function teachingKindLabel(kind: Learning["kind"]): string {
  if (kind === "voice") return "Voice";
  if (kind === "fact") return "Fact";
  return "Unsorted";
}

function surfaceLabel(profile: Profile, surfaceId: string): string {
  return profile.surfaces.find((item) => item.id === surfaceId)?.label ?? surfaceId;
}

function linkedDrafts(counts: Record<string, number>, goldId: string): string {
  const count = counts[goldId] ?? 0;
  if (count === 0) return "Not picked yet";
  if (count === 1) return "Picked once";
  return `Picked ${count} times`;
}

function GoldsLibrary({
  profile,
  golds,
  draftCounts,
  query,
  filter,
  selectedId,
  onQuery,
  onFilter,
  onSelect,
  onSaveGold,
}: {
  profile: Profile;
  golds: Gold[];
  draftCounts: Record<string, number>;
  query: string;
  filter: string;
  selectedId: string | null;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onSaveGold: (id: string, patch: { canonical?: boolean; body?: string; surface?: string; architecture?: string }) => Promise<boolean>;
}) {
  const activeCount = golds.filter((gold) => gold.canonical).length;
  const needle = query.trim().toLowerCase();
  const visible = golds.filter((gold) => {
    if (filter === "active" && !gold.canonical) return false;
    if (filter !== "all" && filter !== "active" && gold.surface !== filter) return false;
    if (!needle) return true;
    const haystack = [gold.title, gold.body, gold.architecture, gold.source, surfaceLabel(profile, gold.surface)]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
  const selected = visible.find((gold) => gold.id === selectedId) ?? visible[0] ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftSurface, setDraftSurface] = useState("");
  const [draftArchitecture, setDraftArchitecture] = useState("");
  const editing = selected !== null && editingId === selected.id;
  const surfaceChoices = profile.surfaces.some((item) => item.id === (editing ? draftSurface : selected?.surface))
    ? profile.surfaces
    : [...profile.surfaces, { id: draftSurface || selected?.surface || "other", label: draftSurface || selected?.surface || "Other", maxWords: null, hint: "" }];
  const filterClass = (pressed: boolean) =>
    pressed
      ? "px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wider font-semibold transition-colors"
      : "px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase tracking-wider transition-colors";

  return (
    <section className="w-full mb-space-xl">
      <div className="mb-space-md">
        <div className="flex items-center gap-space-sm mb-1">
          <span aria-hidden="true" className="material-symbols-outlined text-primary text-[20px]">stars</span>
          <h2 className="font-headline-md text-headline-md text-on-surface">Golds · Calibration Reference Library</h2>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {golds.length} {golds.length === 1 ? "gold" : "golds"} indexed
        </p>
      </div>
      <div className="mb-space-md p-space-sm rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
        <div className="relative flex-1 flex items-center">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] absolute left-3 text-primary pointer-events-none">search</span>
          <input
            aria-label="Search golds"
            className="w-full bg-surface-container-low border border-outline-variant/30 focus:border-primary rounded-lg pl-10 pr-4 py-2.5 text-on-surface font-body-sm text-body-sm placeholder:text-outline focus:outline-none transition-colors"
            placeholder={`Search ${golds.length} golds by title, text, or source`}
            type="text"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <div className="flex items-center flex-wrap gap-1.5 shrink-0">
          <button aria-pressed={filter === "all"} className={filterClass(filter === "all")} type="button" onClick={() => onFilter("all")}>
            All ({golds.length})
          </button>
          <button
            aria-pressed={filter === "active"}
            className={
              filter === "active"
                ? "px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors"
                : "px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-wider flex items-center gap-1 transition-colors"
            }
            type="button"
            onClick={() => onFilter("active")}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            In drafts ({activeCount})
          </button>
          {profile.surfaces.map((item) => (
            <button
              key={item.id}
              aria-label={`Show ${item.label} golds`}
              aria-pressed={filter === item.id}
              className={filterClass(filter === item.id)}
              type="button"
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md lg:items-stretch">
        <div className="lg:col-span-7 lg:relative lg:min-h-0">
          <div className="flex h-[520px] max-h-[520px] flex-col rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-md overflow-hidden lg:absolute lg:inset-0 lg:h-auto lg:max-h-none">
            <div className="golds-scroll min-h-0 flex-1 divide-y divide-outline-variant/20 overflow-y-auto overscroll-contain">
            {visible.length === 0 ? (
              <p className="p-space-md font-body-md text-body-md text-on-surface-variant">—</p>
            ) : (
              visible.map((gold) => {
                const pressed = selected?.id === gold.id;
                const label = surfaceLabel(profile, gold.surface);
                return (
                  <button
                    key={gold.id}
                    aria-pressed={pressed}
                    className={
                      pressed
                        ? "w-full text-left p-space-md bg-surface-container-low border-l-2 border-primary cursor-pointer hover:bg-surface-container transition-colors relative"
                        : "w-full text-left p-space-md hover:bg-surface-container-low/60 cursor-pointer transition-colors border-l-2 border-transparent"
                    }
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      onSelect(gold.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-space-sm mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={pressed ? "font-label-lg text-label-lg text-primary font-semibold truncate" : "font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                          {gold.title}
                        </span>
                        <span
                          className={
                            pressed
                              ? "px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-label-sm text-label-sm uppercase shrink-0"
                              : "px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm uppercase shrink-0"
                          }
                        >
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded bg-surface-container font-code-md text-code-md text-tertiary">
                          {linkedDrafts(draftCounts, gold.id)}
                        </span>
                      </div>
                    </div>
                    <p className={pressed ? "font-body-md text-body-md text-on-surface line-clamp-1 italic" : "font-body-md text-body-md text-on-surface-variant line-clamp-1 italic"}>
                      &quot;{gold.body}&quot;
                    </p>
                  </button>
                );
              })
            )}
          </div>
          <div className="p-space-md shrink-0 bg-surface-container-low border-t border-outline-variant/30 flex items-center justify-between text-outline font-code-md text-code-md">
            <div className="flex items-center gap-space-sm">
              <span className="w-2 h-2 rounded-full bg-tertiary" />
              <span className="text-on-surface-variant font-medium">Showing {visible.length} of {golds.length} indexed</span>
            </div>
            <div className="flex items-center gap-1.5 text-outline text-label-sm uppercase tracking-wider">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">arrow_downward</span>
              <span>Scroll to reveal archive</span>
            </div>
          </div>
        </div>
        </div>
        <div className="lg:col-span-5 rounded-xl bg-surface-container p-space-lg shadow-md border border-outline-variant/30 flex flex-col relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between gap-space-md pb-space-md border-b border-outline-variant/20 mb-space-md">
              <div className="flex items-center gap-space-sm min-w-0">
                <span aria-hidden="true" className="material-symbols-outlined text-primary text-[18px] shrink-0">find_in_page</span>
                <span className="font-label-sm text-label-sm text-primary uppercase truncate">
                  Inspector: {selected?.title ?? "—"}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-label-sm text-label-sm uppercase shrink-0">
                {selected ? surfaceLabel(profile, selected.surface) : "—"}
              </span>
            </div>
            <div className="p-space-md rounded-lg bg-surface-container-lowest/80 border border-outline-variant/20 mb-space-md shadow-inner">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider block mb-space-sm">Canonical Text Passage</span>
              <p className="font-body-lg text-body-lg text-on-surface italic">
                {selected ? `"${selected.body}"` : "—"}
              </p>
            </div>
            <div className="space-y-space-sm font-code-md text-code-md">
              <div className="flex items-center justify-between gap-space-md p-space-sm rounded bg-surface-container-lowest/50 text-on-surface-variant">
                <span className="text-outline shrink-0">Surface Target:</span>
                <span className="text-on-surface font-medium text-right">{selected ? surfaceLabel(profile, selected.surface) : "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-space-md p-space-sm rounded bg-surface-container-lowest/50 text-on-surface-variant">
                <span className="text-outline shrink-0">In drafts:</span>
                <span className="text-primary font-medium flex items-center gap-space-sm text-right">
                  {selected?.canonical ? <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" /> : null}
                  {selected ? (selected.canonical ? "Used in drafts" : "Only when it matches") : "—"}
                </span>
              </div>
              <div className="p-space-sm rounded bg-surface-container-lowest/50 text-on-surface-variant">
                <span className="text-outline block mb-space-xs">Cadence Pattern:</span>
                <span className="text-on-surface font-medium font-body-sm text-body-sm">{selected?.architecture || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-space-md p-space-sm rounded bg-surface-container-lowest/50 text-on-surface-variant">
                <span className="text-outline shrink-0">Source:</span>
                <span className="text-on-surface font-medium text-right">{selected?.source || "—"}</span>
              </div>
            </div>
          </div>
          <div className="pt-space-md mt-auto border-t border-outline-variant/20 flex flex-col gap-space-sm shrink-0">
            {editing ? (
              <div className="flex flex-col gap-space-sm">
                <label className="flex flex-col gap-space-xs font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Gold text
                  <textarea
                    className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md normal-case rounded-lg p-space-sm focus:outline-none"
                    rows={4}
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-space-xs font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Surface
                  <select
                    className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md normal-case rounded-lg p-space-sm focus:outline-none"
                    value={draftSurface}
                    onChange={(event) => setDraftSurface(event.target.value)}
                  >
                    {surfaceChoices.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-space-xs font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Architecture
                  <input
                    className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md normal-case rounded-lg p-space-sm focus:outline-none"
                    value={draftArchitecture}
                    onChange={(event) => setDraftArchitecture(event.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-space-sm">
                  <button
                    className="py-2 px-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md"
                    disabled={!draftBody.trim()}
                    type="button"
                    onClick={() => {
                      if (!selected) return;
                      void onSaveGold(selected.id, {
                        body: draftBody,
                        surface: draftSurface,
                        architecture: draftArchitecture,
                      }).then((saved) => {
                        if (saved) setEditingId(null);
                      });
                    }}
                  >
                    Save gold
                  </button>
                  <button
                    className="py-2 px-2 rounded-lg bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md"
                    type="button"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  aria-pressed={Boolean(selected?.canonical)}
                  className="w-full py-2 px-space-md rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface hover:text-primary font-label-md text-label-md transition-colors flex items-center justify-center gap-1.5 border border-outline-variant/30 disabled:opacity-50"
                  disabled={!selected}
                  type="button"
                  onClick={() => {
                    if (!selected) return;
                    void onSaveGold(selected.id, { canonical: !selected.canonical });
                  }}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{selected?.canonical ? "toggle_on" : "toggle_off"}</span>
                  {selected?.canonical ? "Used in drafts" : "Use in drafts"}
                </button>
                <div className="grid grid-cols-2 gap-space-sm">
                  <button
                    className="py-2 px-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors flex items-center justify-center gap-1 text-center disabled:opacity-50"
                    disabled={!selected}
                    type="button"
                    onClick={() => {
                      if (!selected) return;
                      setDraftBody(selected.body);
                      setDraftSurface(selected.surface);
                      setDraftArchitecture(selected.architecture);
                      setEditingId(selected.id);
                    }}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[15px]">tune</span>
                    Edit this gold
                  </button>
                  <div className="py-2 px-2 rounded-lg bg-surface-container-lowest text-primary font-label-md text-label-md flex items-center justify-center gap-1 text-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-[15px]">history</span>
                    {selected ? linkedDrafts(draftCounts, selected.id) : "Not picked yet"}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
