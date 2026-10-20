"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RuleChange } from "@/lib/store";

type Props = {
  changes: RuleChange[];
  days: number;
};

const ACTION_LABEL: Record<RuleChange["action"], string> = {
  blocked: "Blocked: loosens the claims rules",
  merged: "Merged: already covered",
  replaced: "Replaced an older rule",
};

const ACTION_ICON: Record<RuleChange["action"], string> = {
  blocked: "gpp_maybe",
  merged: "call_merge",
  replaced: "swap_horiz",
};

/**
 * What the rule check did on its own: rules it blocked, merged or let replace
 * an older one. Each can be undone.
 */
export function RuleChanges({ changes, days }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function undo(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/learnings/${id}/undo`, { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not undo that change.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that change.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="rule-changes-heading" className="w-full mb-space-xl">
      <div className="flex items-center justify-between mb-space-md">
        <div className="flex items-center gap-space-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-primary text-[20px]">auto_fix_high</span>
          <h2 id="rule-changes-heading" className="font-headline-md text-headline-md text-on-surface">
            Changed automatically
          </h2>
        </div>
        <span className="font-code-md text-code-md text-primary">Last {days} days</span>
      </div>
      {error ? (
        <p className="font-body-sm text-body-sm text-error mb-space-sm" role="alert">
          {error}
        </p>
      ) : null}
      {changes.length === 0 ? (
        <p className="p-space-md rounded-lg bg-surface-container font-body-sm text-body-sm text-on-surface-variant">
          Nothing changed automatically in the last {days} days.
        </p>
      ) : (
        <ul className="space-y-space-sm">
          {changes.map((change) => (
            <li key={change.id} className="p-space-md rounded-xl bg-surface-container-low shadow-sm" aria-label={change.rule}>
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-start gap-space-md min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{ACTION_ICON[change.action]}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest block mb-0.5">
                      {ACTION_LABEL[change.action]}
                    </span>
                    <p className="font-body-md text-body-md text-on-surface">{change.rule}</p>
                    {change.target ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                        {change.action === "replaced" ? "Older rule: " : "Live rule: "}
                        {change.target.rule}
                      </p>
                    ) : null}
                    {change.reason ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Why: {change.reason}</p>
                    ) : null}
                    {change.before || change.after || change.why ? (
                      <details className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                        <summary className="cursor-pointer">The edit it came from</summary>
                        {change.before ? <p className="mt-1">Before: {change.before}</p> : null}
                        {change.after ? <p className="mt-1">After: {change.after}</p> : null}
                        {change.why ? <p className="mt-1">Note: {change.why}</p> : null}
                      </details>
                    ) : null}
                  </div>
                </div>
                {change.undoneAt ? (
                  <span className="font-label-sm text-label-sm text-outline shrink-0">Undone</span>
                ) : (
                  <button
                    className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant font-label-sm text-label-sm transition-colors shrink-0 flex items-center gap-1"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void undo(change.id)}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">undo</span>
                    {busy === change.id ? "Undoing…" : "Undo"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
