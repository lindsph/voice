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
  return (
    <section className="card health">
      <h2>Health</h2>
      <p className="health-range">
        {HEALTH_DAY_CHOICES.map((days) => (
          <a key={days} href={`?days=${days}`} aria-current={report.days === days ? "page" : undefined}>
            Last {days} days
          </a>
        ))}
      </p>
      {report.total === 0 ? (
        <p className="meta">No generations in this period.</p>
      ) : (
        <>
          <ul className="health-metrics">
            <li>
              {report.total} {report.total === 1 ? "generation" : "generations"}
            </li>
            <li>{report.kept} kept</li>
            <li>{report.edited} edited</li>
            <li>{report.rejected} rejected</li>
            <li>{report.pending} pending</li>
            <li>
              {report.retryCount} retries · {percent(report.retryRate)}
            </li>
            <li>Top warning: {report.mostCommonWarning ?? "none"}</li>
            <li>
              Most edits and rejections:{" "}
              {report.busiestProblemSurface
                ? `${surfaceName(profile, report.busiestProblemSurface.surfaceId)} (${report.busiestProblemSurface.problemCount})`
                : "none"}
            </li>
            {report.modelWithMostRetries ? (
              <li>
                Most retries: {report.modelWithMostRetries.model} ({report.modelWithMostRetries.count})
              </li>
            ) : null}
          </ul>

          <h3>Surfaces needing attention</h3>
          {report.surfaces.length === 0 ? (
            <p className="meta">No surfaces in this period.</p>
          ) : (
            <ul className="health-list">
              {report.surfaces.map((surface) => (
                <li key={surface.surfaceId}>
                  {surfaceName(profile, surface.surfaceId)} — {surface.total} generations · {surface.edited} edited ·{" "}
                  {surface.rejected} rejected · {percent(surface.problemRate)} edited or rejected · {surface.retryCount}{" "}
                  retries
                  {surface.topWarning ? ` · Top warning: ${surface.topWarning}` : ""}
                </li>
              ))}
            </ul>
          )}

          <h3>Common warnings</h3>
          {report.warnings.length === 0 ? (
            <p className="meta">No warnings in this period.</p>
          ) : (
            <ul className="health-list">
              {report.warnings.map((warning) => (
                <li key={warning.text}>
                  {warning.text} — {warning.count} · {warning.surfaces.map((id) => surfaceName(profile, id)).join(", ")} ·{" "}
                  {warning.retryCount} retries · {formatGenerationStamp(warning.latest, timeZone)}
                </li>
              ))}
            </ul>
          )}

          <h3>Retries</h3>
          {report.retryCount === 0 ? (
            <p className="meta">No retries in this period.</p>
          ) : (
            <>
              <p className="meta">
                {report.retryCount} retries · {percent(report.retryRate)} of generations
              </p>
              <Breakdown title="By surface" rows={report.retryBySurface} label={(key) => surfaceName(profile, key)} />
              <Breakdown title="By model" rows={report.retryByModel} empty="No model on these retries." />
              <Breakdown title="By reason" rows={report.retryByReason} empty="No retry reason recorded." />
            </>
          )}

          <h3>Learnings worth reviewing</h3>
          <p className="meta">Correlation, not proof.</p>
          {report.learnings.length === 0 ? (
            <p className="meta">No learnings in this period.</p>
          ) : (
            <ul className="health-list">
              {report.learnings.map((learning) => (
                <li key={learning.id}>
                  {learning.rule}
                  {learning.kind ? ` · ${learning.kind}` : ""} — {learning.total} uses · {learning.kept} kept ·{" "}
                  {learning.edited} edited · {learning.rejected} rejected · {learning.pending} pending ·{" "}
                  {percent(learning.rejectionRate)}
                </li>
              ))}
            </ul>
          )}

          <h3>Gold examples worth reviewing</h3>
          <p className="meta">Correlation, not proof.</p>
          {report.golds.length === 0 ? (
            <p className="meta">No gold examples in this period.</p>
          ) : (
            <ul className="health-list">
              {report.golds.map((gold) => (
                <li key={gold.id}>
                  {gold.title}
                  {gold.surface ? ` · ${surfaceName(profile, gold.surface)}` : ""}
                  {gold.architecture ? ` · ${gold.architecture}` : ""} — {gold.total} uses · {gold.kept} kept · {gold.edited}{" "}
                  edited · {gold.rejected} rejected · {gold.pending} pending · {percent(gold.rejectionRate)}
                </li>
              ))}
            </ul>
          )}

          <h3>Possible claim issues</h3>
          {report.claims.length === 0 ? (
            <p className="meta">No claim-related warnings or notes in this period.</p>
          ) : (
            <ul className="health-list">
              {report.claims.map((claim) => (
                <li key={claim.term}>
                  {claim.term} — {claim.count} · {claim.surfaces.map((id) => surfaceName(profile, id)).join(", ")} ·{" "}
                  {formatGenerationStamp(claim.latest, timeZone)}
                  {claim.generationIds.length > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      {claim.generationIds.map((id, index) => (
                        <span key={id}>
                          {index > 0 ? ", " : ""}
                          <a href={`#generation-${id}`}>{id}</a>
                        </span>
                      ))}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Breakdown({
  title,
  rows,
  label,
  empty,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  label?: (key: string) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="meta">{empty ?? `No ${title.toLowerCase()}.`}</p>;
  return (
    <p className="meta">
      {title}: {rows.map((row) => `${label ? label(row.key) : row.key} ${row.count}`).join(" · ")}
    </p>
  );
}
