"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { modelLabel, retryLabel } from "@/components/draft-trace";
import { formatGenerationStamp } from "@/lib/generation-log";
import type { GenerationLogRow, Profile } from "@/lib/types";

const OUTCOMES = [
  ["kept", "Kept"],
  ["edited", "Edited"],
  ["rejected", "Rejected"],
] as const;

function outcomeLabel(outcome: GenerationLogRow["outcome"]): string {
  if (outcome === "pending") return "Pending";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function GenerationRow({
  log,
  surfaceLabel,
  timeZone,
}: {
  log: GenerationLogRow;
  surfaceLabel: string;
  timeZone?: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(log.userNote ?? "");
  const [edit, setEdit] = useState(log.editedBody ?? "");
  const [showEdit, setShowEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(outcome: "kept" | "edited" | "rejected", editedBody?: string) {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/generations/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          userNote: note,
          ...(outcome === "edited" ? { editedBody } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      setShowEdit(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const warningLine = log.warnings.length > 0 ? log.warnings.join("; ") : "none";
  const retryLine = log.retried
    ? log.retryReason
      ? `yes · ${retryLabel(log.retryReason)}`
      : "yes"
    : "no";

  const outcomeIcon = { kept: "thumb_up", edited: "edit", rejected: "thumb_down" } as const;

  return (
    <li className="p-space-lg rounded-xl bg-surface-container-low shadow-sm" id={`generation-${log.id}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pb-space-md">
        <span className="font-code-md text-code-md text-on-surface font-medium">
          {[
            formatGenerationStamp(log.createdAt, timeZone),
            surfaceLabel,
            log.architecture,
            log.model ? modelLabel(log.model) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <div className="flex flex-wrap items-center gap-space-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm font-semibold">
            {outcomeLabel(log.outcome)}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-error-container/40 text-error font-label-sm text-label-sm">
            Warnings: {warningLine}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-label-sm">
            Retried: {retryLine}
          </span>
        </div>
      </div>
      <div className="space-y-space-md py-space-sm">
        <div className="p-space-md rounded-lg bg-surface-container-lowest">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider block mb-1">
            Draft
          </span>
          <p className={log.editedBody ? "font-body-md text-body-md text-on-surface-variant line-through decoration-error/50" : "font-body-md text-body-md text-on-surface"}>
            {log.generatedBody || "—"}
          </p>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-high">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider block">
              The edit
            </span>
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[16px]">check</span>
          </div>
          {showEdit ? (
            <label>
              Your edit
              <textarea value={edit} onChange={(event) => setEdit(event.target.value)} />
            </label>
          ) : (
            <p className="font-body-lg text-body-lg text-on-surface">{log.editedBody || "—"}</p>
          )}
        </div>
      </div>
      <div className="mt-space-sm p-space-md rounded-lg bg-surface-container flex items-start gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-outline mt-0.5 text-[18px]">sticky_note_2</span>
        <label className="block flex-1">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider block">Note</span>
          <input
            className="mt-1 w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Too certain about pest benefits."
          />
        </label>
      </div>
      <div className="mt-space-md p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-space-xs font-code-md text-code-md text-on-surface-variant">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider text-primary">What was used</span>
        <div className="flex flex-wrap items-center gap-space-md pt-1">
          <span>
            Facts: <strong className="text-on-surface">{log.facts.length} chars</strong>
          </span>
          <span>·</span>
          <span>
            Golds: <strong className="text-on-surface">{log.selectedGoldIds.length > 0 ? log.selectedGoldIds.join(", ") : "—"}</strong>
          </span>
          <span>·</span>
          <span>
            Rules: <strong className="text-on-surface">{log.selectedLearningIds.length > 0 ? log.selectedLearningIds.join(", ") : "—"}</strong>
          </span>
        </div>
      </div>
      <div className="mt-space-lg pt-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-xs">
          {OUTCOMES.map(([value, label]) => (
            <button
              key={value}
              className={
                log.outcome === value
                  ? "px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold flex items-center gap-1"
                  : "px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant font-label-md text-label-md transition-colors flex items-center gap-1"
              }
              type="button"
              disabled={saving}
              aria-pressed={log.outcome === value}
              onClick={() => {
                if (value === "edited") {
                  setShowEdit(true);
                  if (!edit) setEdit(log.editedBody ?? log.generatedBody);
                  return;
                }
                void save(value);
              }}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{outcomeIcon[value]}</span>
              {log.outcome === value && value === "edited" ? "Edited (Active)" : label}
            </button>
          ))}
        </div>
        <button
          className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container hover:brightness-110 font-label-md text-label-md font-bold transition-all shadow-sm flex items-center justify-center gap-space-xs"
          type="button"
          disabled={saving || !showEdit}
          onClick={() => void save("edited", edit)}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">save</span>
          Save edit
        </button>
      </div>
      {error ? <p className="font-body-sm text-body-sm text-error mt-space-sm">{error}</p> : null}
    </li>
  );
}

function EmptyGeneration() {
  return (
    <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pb-space-md">
        <span className="font-code-md text-code-md text-on-surface font-medium">—</span>
        <div className="flex flex-wrap items-center gap-space-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm font-semibold">—</span>
          <span className="px-2.5 py-0.5 rounded-full bg-error-container/40 text-error font-label-sm text-label-sm">Warnings: —</span>
          <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-label-sm">Retried: 0</span>
        </div>
      </div>
      <div className="space-y-space-md py-space-sm">
        <div className="p-space-md rounded-lg bg-surface-container-lowest">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider block mb-1">
            Draft
          </span>
          <p className="font-body-md text-body-md text-on-surface">—</p>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-high">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider block">
              The edit
            </span>
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[16px]">check</span>
          </div>
          <p className="font-body-lg text-body-lg text-on-surface">—</p>
        </div>
      </div>
      <div className="mt-space-sm p-space-md rounded-lg bg-surface-container flex items-start gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-outline mt-0.5 text-[18px]">sticky_note_2</span>
        <div>
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider block">Note</span>
          <p className="font-body-md text-body-md text-on-surface">—</p>
        </div>
      </div>
      <div className="mt-space-md p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-space-xs font-code-md text-code-md text-on-surface-variant">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider text-primary">What was used</span>
        <div className="flex flex-wrap items-center gap-space-md pt-1">
          <span>
            Facts: <strong className="text-on-surface">0 chars</strong>
          </span>
          <span>·</span>
          <span>
            Golds: <strong className="text-on-surface">—</strong>
          </span>
          <span>·</span>
          <span>
            Rules: <strong className="text-on-surface">—</strong>
          </span>
        </div>
      </div>
      <div className="mt-space-lg pt-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-xs">
          {OUTCOMES.map(([value, label]) => (
            <button
              key={value}
              className="px-3 py-1.5 rounded-lg bg-surface-container-highest text-on-surface-variant font-label-md text-label-md flex items-center gap-1"
              type="button"
              disabled
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="px-space-lg py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md text-label-md font-bold flex items-center justify-center gap-space-xs"
          type="button"
          disabled
        >
          Save edit
        </button>
      </div>
    </div>
  );
}

export function RecentGenerations({
  profile,
  logs,
  timeZone,
}: {
  profile: Profile;
  logs: GenerationLogRow[];
  timeZone?: string;
}) {
  return (
    <section className="w-full mb-space-xl">
      <div className="flex items-center justify-between mb-space-md">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-primary text-[20px]">history_edu</span>
          <h2 className="font-headline-md text-headline-md text-on-surface">Recent generations</h2>
        </div>
        <span className="font-code-md text-code-md text-outline">
          {logs.length} {logs.length === 1 ? "Generation" : "Generations"} Logged
        </span>
      </div>
      {logs.length === 0 ? (
        <EmptyGeneration />
      ) : (
        <ul className="space-y-space-md">
          {logs.map((log) => {
            const surface = profile.surfaces.find((item) => item.id === log.surfaceId);
            return (
              <GenerationRow
                key={log.id}
                log={log}
                surfaceLabel={surface?.label ?? log.surfaceId}
                timeZone={timeZone}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
