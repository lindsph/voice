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

  return (
    <li>
      <p>
        {[
          formatGenerationStamp(log.createdAt, timeZone),
          surfaceLabel,
          log.architecture,
          log.model ? modelLabel(log.model) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="meta">Outcome: {outcomeLabel(log.outcome)}</p>
      <p className="meta">Warnings: {warningLine}</p>
      <p className="meta">Retried: {retryLine}</p>
      <p className="generation-label">Draft</p>
      <p className="generation-body">{log.generatedBody}</p>
      {log.editedBody ? (
        <>
          <p className="generation-label">Your edit</p>
          <p className="generation-body">{log.editedBody}</p>
        </>
      ) : null}
      {log.userNote ? <p className="meta">Note: {log.userNote}</p> : null}
      <details>
        <summary>What was used</summary>
        <p className="meta">Facts: {log.facts}</p>
        <p className="meta">
          Golds: {log.selectedGoldIds.length > 0 ? log.selectedGoldIds.join(", ") : "none"}
        </p>
        <p className="meta">
          Rules:{" "}
          {log.selectedLearningIds.length > 0 ? log.selectedLearningIds.join(", ") : "none"}
        </p>
      </details>
      <div className="actions">
        {OUTCOMES.map(([value, label]) => (
          <button
            key={value}
            className="ghost"
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
            {label}
          </button>
        ))}
      </div>
      {showEdit ? (
        <>
          <label>
            Your edit
            <textarea value={edit} onChange={(event) => setEdit(event.target.value)} />
          </label>
          <button
            className="primary"
            type="button"
            disabled={saving}
            onClick={() => void save("edited", edit)}
          >
            Save edit
          </button>
        </>
      ) : null}
      <label>
        Note
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Too certain about pest benefits."
        />
      </label>
      {error ? <p className="meta">{error}</p> : null}
    </li>
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
    <section className="card recent-generations">
      <h2>{profile.name} — Recent generations</h2>
      {logs.length === 0 ? (
        <p className="meta">No drafts logged yet.</p>
      ) : (
        <ul className="generation-list">
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
