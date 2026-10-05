import { formatGenerationStamp } from "@/lib/generation-log";
import { HEALTH_DAY_CHOICES, type HealthReport } from "@/lib/health";
import type { Profile } from "@/lib/types";

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function surfaceName(profile: Profile, surfaceId: string): string {
  return profile.surfaces.find((surface) => surface.id === surfaceId)?.label ?? surfaceId;
}

export function ProfileHealth({
  profile,
  report,
  timeZone,
}: {
  profile: Profile;
  report: HealthReport;
  timeZone?: string;
}) {
  const rangeClass = (days: number) =>
    report.days === days
      ? "px-3 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm uppercase font-semibold"
      : "px-3 py-1 rounded text-on-surface-variant font-label-sm text-label-sm uppercase hover:text-on-surface transition-colors";

  return (
    <section className="w-full mb-space-xl p-space-lg rounded-xl bg-surface-container-lowest shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md mb-space-lg">
        <div>
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-tertiary text-[20px]">query_stats</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Health</h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Model drift, accuracy bounds, and calibration telemetry.
          </p>
        </div>
        <div className="flex items-center p-1 rounded-lg bg-surface-container">
          {HEALTH_DAY_CHOICES.map((days) => (
            <a key={days} aria-current={report.days === days ? "page" : undefined} className={rangeClass(days)} href={`?days=${days}`}>
              Last {days} days
            </a>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-space-sm mb-space-lg">
        <Metric label="Generations" value={String(report.total)} />
        <Metric label="Kept" value={String(report.kept)} tone="text-tertiary" />
        <Metric label="Edited" value={String(report.edited)} tone="text-primary" />
        <Metric label="Rejected" value={String(report.rejected)} tone="text-error" />
        <Metric label="Pending" value={String(report.pending)} tone="text-secondary" />
        <Metric label="Retries" value={`${report.retryCount} (${percent(report.retryRate)})`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Top Surfaces
            <span className="material-symbols-outlined text-[16px] text-outline">dns</span>
          </h3>
          {report.surfaces.length === 0 ? (
            <DashRow />
          ) : (
            <div className="space-y-space-xs font-body-sm text-body-sm">
              {report.surfaces.map((surface) => (
                <div key={surface.surfaceId}>
                  <div className="flex items-center justify-between text-on-surface">
                    <span>{surfaceName(profile, surface.surfaceId)}</span>
                    <span className="font-code-md text-code-md text-primary font-bold">{surface.total}</span>
                  </div>
                  <p className="font-code-md text-code-md text-on-surface-variant">
                    {surface.edited} edited · {surface.rejected} rejected · {surface.retryCount} retries
                    {surface.topWarning ? ` · ${surface.topWarning}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Top Warnings
            <span className="material-symbols-outlined text-[16px] text-outline">warning</span>
          </h3>
          {report.warnings.length === 0 ? (
            <DashRow />
          ) : (
            <div className="space-y-space-xs font-body-sm text-body-sm">
              {report.warnings.map((warning) => (
                <div key={warning.text}>
                  <div className="flex items-center justify-between text-on-surface">
                    <span>{warning.text}</span>
                    <span className="font-code-md text-code-md text-error font-bold">{warning.count}</span>
                  </div>
                  <p className="font-code-md text-code-md text-on-surface-variant">
                    {warning.surfaces.map((id) => surfaceName(profile, id)).join(", ")} · {warning.retryCount} retries ·{" "}
                    {formatGenerationStamp(warning.latest, timeZone)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Retries Audit
            <span className="material-symbols-outlined text-[16px] text-outline">replay</span>
          </h3>
          <div className="space-y-space-xs font-code-md text-code-md text-on-surface-variant">
            <Breakdown rows={report.retryBySurface} prefix="By surface" label={(key) => surfaceName(profile, key)} />
            <Breakdown rows={report.retryByModel} prefix="By model" />
            <Breakdown rows={report.retryByReason} prefix="By reason" />
          </div>
        </article>
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Top Learnings
            <span className="material-symbols-outlined text-[16px] text-outline">psychology</span>
          </h3>
          <p className="font-label-sm text-label-sm text-outline italic">Correlation, not proof.</p>
          {report.learnings.length === 0 ? (
            <EmptyScore />
          ) : (
            report.learnings.map((learning) => (
              <div key={learning.id} className="space-y-space-xs mt-space-sm">
                <p className="font-body-sm text-body-sm text-on-surface font-medium">{learning.rule}</p>
                <p className="font-code-md text-code-md text-on-surface-variant">
                  {learning.kind ? `${learning.kind} · ` : ""}
                  {learning.total} uses · {learning.kept} kept · {learning.edited} edited · {learning.rejected} rejected ·{" "}
                  {learning.pending} pending · {percent(learning.rejectionRate)}
                </p>
              </div>
            ))
          )}
        </article>
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Top Golds
            <span className="material-symbols-outlined text-[16px] text-outline">grade</span>
          </h3>
          <p className="font-label-sm text-label-sm text-outline italic">Correlation, not proof.</p>
          {report.golds.length === 0 ? (
            <EmptyScore />
          ) : (
            report.golds.map((gold) => (
              <div key={gold.id} className="space-y-space-xs mt-space-sm">
                <p className="font-body-sm text-body-sm text-on-surface font-medium">{gold.title}</p>
                <p className="font-code-md text-code-md text-on-surface-variant">
                  {gold.surface ? `${surfaceName(profile, gold.surface)} · ` : ""}
                  {gold.architecture ? `${gold.architecture} · ` : ""}
                  {gold.total} uses · {gold.kept} kept · {gold.edited} edited · {gold.rejected} rejected · {gold.pending}{" "}
                  pending · {percent(gold.rejectionRate)}
                </p>
              </div>
            ))
          )}
        </article>
        <article className="p-space-md rounded-lg bg-surface-container">
          <h3 className="font-label-lg text-label-lg text-secondary uppercase tracking-wider mb-space-sm flex items-center justify-between">
            Possible Claim Issues
            <span className="material-symbols-outlined text-[16px] text-error">flag</span>
          </h3>
          {report.claims.length === 0 ? (
            <DashRow />
          ) : (
            report.claims.map((claim) => (
              <div key={claim.term} className="space-y-space-xs">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-on-surface">
                    {claim.term} — {claim.count}
                  </span>
                  <span className="font-code-md text-code-md text-outline">
                    {claim.surfaces.map((id) => surfaceName(profile, id)).join(", ")} ·{" "}
                    {formatGenerationStamp(claim.latest, timeZone)}
                  </span>
                </div>
                {claim.generationIds.map((id) => (
                  <a key={id} aria-label={id} className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline pt-1" href={`#generation-${id}`}>
                    {id}
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                ))}
              </div>
            ))
          )}
        </article>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "text-on-surface" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
      <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{label}</span>
      <span className={`font-headline-sm text-headline-sm mt-1 ${tone}`}>{value}</span>
    </div>
  );
}

function DashRow() {
  return (
    <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface">
      <span>—</span>
      <span className="font-code-md text-code-md text-outline">0</span>
    </div>
  );
}

function EmptyScore() {
  return (
    <div className="space-y-space-xs mt-space-sm">
      <p className="font-body-sm text-body-sm text-on-surface font-medium">—</p>
      <p className="font-code-md text-code-md text-on-surface-variant">0 uses · 0 kept · 0 edited · 0 rejected · 0%</p>
    </div>
  );
}

function Breakdown({
  rows,
  prefix,
  label,
}: {
  rows: Array<{ key: string; count: number }>;
  prefix: string;
  label?: (key: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <span>
          {prefix}: —
        </span>
        <span className="text-on-surface">0</span>
      </div>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between">
          <span>
            {prefix}: {label ? label(row.key) : row.key}
          </span>
          <span className="text-on-surface">{row.count}</span>
        </div>
      ))}
    </>
  );
}
