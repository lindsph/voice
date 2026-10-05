import Link from "next/link";

import { modelLabel } from "@/components/draft-trace";
import { formatGenerationStamp } from "@/lib/generation-log";
import { HEALTH_DAY_CHOICES, type HealthReport } from "@/lib/health";
import type { Profile } from "@/lib/types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export type HomeCard = {
  profile: Profile;
  report: HealthReport;
};

function roman(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function share(part: number, total: number): string {
  if (total === 0) return "0%";
  return percent(part / total);
}

function countWord(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function surfaceName(profile: Profile, surfaceId: string): string {
  return profile.surfaces.find((surface) => surface.id === surfaceId)?.label ?? surfaceId;
}

function activeSurfaceId(profile: Profile, report: HealthReport): string | null {
  let best: { id: string; total: number } | null = null;
  for (const surface of profile.surfaces) {
    const total = report.surfaces.find((row) => row.surfaceId === surface.id)?.total ?? 0;
    if (total > 0 && (!best || total > best.total)) best = { id: surface.id, total };
  }
  return best?.id ?? null;
}

export function HomeDesk({ cards, timeZone }: { cards: HomeCard[]; timeZone?: string }) {
  const count = cards.length;
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-20 max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop flex items-center justify-between">
          <Link
            className="font-headline-md text-headline-md tracking-tight text-on-surface hover:text-primary transition-colors duration-200"
            href="/"
          >
            Voice
          </Link>
          <div className="flex items-center gap-space-xl">
            <nav className="flex items-center gap-space-lg">
              <Link
                className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors duration-150"
                href="/"
              >
                Home
              </Link>
              <Link
                className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors duration-150"
                href="/"
              >
                Projects
              </Link>
              {cards.map((card) => (
                <Link
                  key={card.profile.id}
                  className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors duration-150"
                  href={`/${card.profile.id}`}
                >
                  {card.profile.name}
                </Link>
              ))}
            </nav>
            <div aria-hidden="true" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </div>
          </div>
        </div>
      </header>
      <main className="w-full pt-20 bg-background min-h-screen">
        <div className="flex flex-col w-full max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl gap-space-xl">
          <section className="w-full bg-surface-container-low rounded-xl p-space-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-space-lg shadow-md">
            <div className="flex flex-col gap-space-xs max-w-3xl">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  {count} {count === 1 ? "profile" : "profiles"} monitored
                </span>
                <span className="text-outline-variant font-label-sm text-label-sm">•</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Strict ADHD Scanning: 1 line per insight
                </span>
              </div>
              <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">
                One teacher. Separate mouths. Work on voice here
                {cards.length > 0 ? (
                  <>
                    ;{" "}
                    {cards.map((card, index) => (
                      <span key={card.profile.id}>
                        {index > 0 ? (index === cards.length - 1 ? " and " : ", ") : null}
                        <span className="font-headline-sm italic text-primary">{card.profile.name}</span>
                      </span>
                    ))}{" "}
                    call it when they draft.
                  </>
                ) : (
                  "."
                )}
              </h1>
            </div>
            <div className="flex items-center gap-space-sm shrink-0 bg-surface-container px-space-md py-space-sm rounded-full">
              <span className="material-symbols-outlined text-tertiary text-[18px]">verified_user</span>
              <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider font-semibold">
                Calibration Synced
              </span>
            </div>
          </section>
          {cards.map((card, index) => (
            <ProfileCard key={card.profile.id} card={card} index={index} timeZone={timeZone} />
          ))}
        </div>
      </main>
      <footer className="w-full bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop py-space-xl flex flex-col sm:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="font-headline-sm text-headline-sm text-on-surface-variant">Voice</span>
            <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase">— Cadence & Prose</span>
          </div>
          <div className="font-code-md text-code-md text-outline">© 2025 Voice Editorial System. Preserving focus.</div>
        </div>
      </footer>
    </>
  );
}

function ProfileCard({ card, index, timeZone }: { card: HomeCard; index: number; timeZone?: string }) {
  const { profile, report } = card;
  const accent = index === 0 ? "primary" : "secondary";
  const accentText = accent === "primary" ? "text-primary" : "text-secondary";
  const activeId = activeSurfaceId(profile, report);
  const learning = report.learnings[0];
  const gold = report.golds[0];
  const claim = report.claims[0];
  const attention = report.busiestProblemSurface
    ? report.surfaces.find((row) => row.surfaceId === report.busiestProblemSurface?.surfaceId)
    : undefined;
  const bottomQuiet = !learning && !gold && !claim;

  return (
    <section className="w-full bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-xl shadow-lg relative overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-lg bg-surface-container/30 -mx-space-xl -mt-space-xl px-space-xl pt-space-xl">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className={`font-display-lg text-headline-lg font-serif ${accentText}`}>{roman(index)}.</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-serif italic tracking-tight">{profile.name}</h2>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">{profile.description}</p>
        </div>
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg">
            {HEALTH_DAY_CHOICES.map((days) => (
              <Link
                key={days}
                aria-current={report.days === days ? "page" : undefined}
                className={
                  report.days === days
                    ? accent === "primary"
                      ? "px-space-sm py-1 rounded font-label-sm text-label-sm bg-primary-container text-on-primary-container font-semibold transition-colors"
                      : "px-space-sm py-1 rounded font-label-sm text-label-sm bg-secondary-container text-on-secondary-container font-semibold transition-colors"
                    : "px-space-sm py-1 rounded font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface transition-colors"
                }
                href={`/?days=${days}`}
              >
                Last {days} days
              </Link>
            ))}
          </div>
          <Link
            className={
              accent === "primary"
                ? "inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary text-on-primary font-label-lg text-label-lg font-bold hover:shadow-lg hover:shadow-primary/20 transition-all"
                : "inline-flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high text-on-surface font-label-lg text-label-lg font-bold hover:bg-surface-bright transition-all"
            }
            href={`/${profile.id}`}
          >
            <span>
              Open project → /{profile.id}
            </span>
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-space-sm flex-wrap -mt-space-md">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mr-space-xs">Surfaces:</span>
        {profile.surfaces.map((surface) => {
          const active = surface.id === activeId;
          return (
            <span
              key={surface.id}
              className={
                active
                  ? `px-3 py-1 rounded-full bg-surface-container font-label-sm text-label-sm flex items-center gap-1.5 shadow-sm ${accentText}`
                  : "px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"
              }
            >
              {active ? <span className={`w-1.5 h-1.5 rounded-full ${accent === "primary" ? "bg-primary" : "bg-secondary"}`} /> : null}
              {surface.label}
              {active ? " (Active)" : ""}
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-space-md">
        <Metric
          caption={report.total === 0 ? "None in this period" : "In this window"}
          captionTone="text-outline"
          icon="draw"
          label="Generations"
          labelTone="text-outline"
          value={String(report.total)}
          valueTone="text-on-surface"
        />
        <Metric
          bar={report.kept > 0 ? "bg-tertiary" : undefined}
          caption={report.kept > 0 ? `Direct pass (${share(report.kept, report.total)})` : "None logged"}
          captionTone={report.kept > 0 ? "text-tertiary" : "text-outline"}
          icon="check_circle"
          label="Kept"
          labelTone={report.kept > 0 ? "text-tertiary font-semibold" : "text-outline"}
          value={String(report.kept)}
          valueTone={report.kept > 0 ? "text-tertiary" : "text-on-surface-variant"}
        />
        <Metric
          bar={report.edited > 0 ? (accent === "primary" ? "bg-primary" : "bg-secondary") : undefined}
          caption={report.edited > 0 ? `Manual trim (${share(report.edited, report.total)})` : "None logged"}
          captionTone={report.edited > 0 ? accentText : "text-outline"}
          icon="edit_note"
          label="Edited"
          labelTone={report.edited > 0 ? `${accentText} font-semibold` : "text-outline"}
          value={String(report.edited)}
          valueTone={report.edited > 0 ? accentText : "text-on-surface-variant"}
        />
        <Metric
          bar={report.rejected > 0 ? "bg-error" : undefined}
          caption={report.rejected > 0 ? (report.mostCommonWarning ?? "Rejected") : "None logged"}
          captionTone={report.rejected > 0 ? "text-error" : "text-outline"}
          icon="cancel"
          label="Rejected"
          labelTone={report.rejected > 0 ? "text-error font-semibold" : "text-outline"}
          value={String(report.rejected)}
          valueTone={report.rejected > 0 ? "text-error" : "text-on-surface-variant"}
        />
        <Metric
          bar={report.pending > 0 ? "bg-secondary" : undefined}
          caption={report.pending > 0 ? "In review" : "None logged"}
          captionTone={report.pending > 0 ? "text-on-surface-variant" : "text-outline"}
          icon="hourglass_empty"
          label="Pending"
          labelTone={report.pending > 0 ? "text-secondary" : "text-outline"}
          span
          value={String(report.pending)}
          valueTone={report.pending > 0 ? "text-on-surface" : "text-on-surface-variant"}
        />
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-xl flex flex-col gap-space-xs">
        <Insight
          dot="bg-outline"
          label="Ratio Log"
          shaded
          text={`${report.total} generations · ${report.kept} kept · ${report.edited} edited · ${report.rejected} rejected · ${report.pending} pending`}
          textTone="text-on-surface"
        />
        <Insight
          dot={accent === "primary" ? "bg-primary" : "bg-secondary"}
          label="Latency"
          text={`${countWord(report.retryCount, "retry", "retries")} · ${percent(report.retryRate)} retry rate`}
          textTone="text-on-surface-variant"
        />
        <Insight
          dot={report.mostCommonWarning ? "bg-primary-container" : "bg-tertiary"}
          label="Triage Anchor"
          labelTone={report.mostCommonWarning ? "text-primary font-semibold" : "text-tertiary font-semibold"}
          shaded
          text={`Top warning: ${report.mostCommonWarning ?? "none"}`}
          textTone={report.mostCommonWarning ? "text-primary" : "text-tertiary"}
        />
        <Insight
          dot="bg-outline"
          label="Surface Hub"
          text={
            report.busiestProblemSurface
              ? `Most edits and rejections: ${surfaceName(profile, report.busiestProblemSurface.surfaceId)} (${report.busiestProblemSurface.problemCount})`
              : "Most edits and rejections: none"
          }
          textTone="text-on-surface-variant"
        />
        <Insight
          dot="bg-secondary"
          label="Engine"
          shaded
          text={
            report.modelWithMostRetries
              ? `Most retries: ${modelLabel(report.modelWithMostRetries.model)} (${report.modelWithMostRetries.count})`
              : "Most retries: none"
          }
          textTone="text-on-surface-variant"
        />
      </div>
      <Attention profile={profile} report={report} surface={attention} timeZone={timeZone} />
      {bottomQuiet ? (
        <Archive clear={!attention} days={report.days} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {learning ? (
              <article className="bg-surface-container p-space-md rounded-xl flex flex-col gap-space-xs relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">school</span>
                    <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider font-semibold">One Learning</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-outline uppercase">Correlation, not proof</span>
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-serif italic">“{learning.rule}”</div>
                <div className="font-code-md text-code-md text-on-surface-variant mt-space-xs">
                  {learning.kind ? `${learning.kind} — ` : ""}
                  {learning.total} uses · {learning.kept} kept · {learning.edited} edited · {learning.rejected} rejected ·{" "}
                  {learning.pending} pending · {percent(learning.rejectionRate)} rejected
                </div>
              </article>
            ) : (
              <EmptyCheck text="No learnings in this period." />
            )}
            {gold ? (
              <article className="bg-surface-container p-space-md rounded-xl flex flex-col gap-space-xs relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-primary text-[18px]">stars</span>
                    <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-semibold">One Gold</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-outline uppercase">Cadence Anchor</span>
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-serif italic">
                  “{gold.title}”
                  {gold.surface ? ` • ${surfaceName(profile, gold.surface)}` : ""}
                  {gold.architecture ? ` • ${gold.architecture}` : ""}
                </div>
                <div className="font-code-md text-code-md text-on-surface-variant mt-space-xs">
                  {gold.total} uses · {gold.kept} kept · {gold.edited} edited · {gold.rejected} rejected · {gold.pending} pending ·{" "}
                  {percent(gold.rejectionRate)} rejected
                </div>
              </article>
            ) : (
              <EmptyCheck text="No gold examples in this period." />
            )}
          </div>
          {claim ? (
            <div className="bg-surface-container-lowest p-space-md rounded-xl flex items-center justify-between gap-space-md flex-wrap">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-error text-[20px]">flag</span>
                <span className="font-body-md text-body-md text-on-surface">
                  Possible claim issue: <strong className="text-primary font-bold">{claim.term}</strong> — {claim.count} •{" "}
                  {claim.surfaces.map((id) => surfaceName(profile, id)).join(" • ")} • {formatGenerationStamp(claim.latest, timeZone)}
                </span>
              </div>
              {claim.generationIds[0] ? (
                <Link
                  className="font-label-sm text-label-sm text-primary hover:underline uppercase tracking-wider flex items-center gap-1 font-semibold"
                  href={`/${profile.id}#generation-${claim.generationIds[0]}`}
                >
                  <span>link to that generation</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    north_east
                  </span>
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="bg-surface-container-lowest p-space-md rounded-xl flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-outline text-[20px]">flag</span>
              <span className="font-body-md text-body-md text-on-surface-variant">No claim warnings logged.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Attention({
  profile,
  report,
  surface,
  timeZone,
}: {
  profile: Profile;
  report: HealthReport;
  surface: HealthReport["surfaces"][number] | undefined;
  timeZone?: string;
}) {
  const warning = report.warnings[0];
  if (!surface) {
    return (
      <div className="bg-surface-container-high rounded-xl p-space-md flex flex-col gap-space-xs relative overflow-hidden shadow-sm">
        <div className="w-1.5 absolute left-0 top-0 bottom-0 bg-outline" />
        <div className="flex items-center gap-space-xs pl-2">
          <span className="material-symbols-outlined text-outline text-[18px]">warning</span>
          <span className="font-label-sm text-label-sm text-outline uppercase font-bold tracking-wider">Surfaces Needing Attention</span>
        </div>
        <div className="pl-2 font-body-md text-body-md text-on-surface-variant">No surface needs attention in this period.</div>
      </div>
    );
  }
  const name = surfaceName(profile, surface.surfaceId);
  return (
    <div className="bg-surface-container-high rounded-xl p-space-md flex flex-col gap-space-xs relative overflow-hidden shadow-sm">
      <div className="w-1.5 absolute left-0 top-0 bottom-0 bg-primary" />
      <div className="flex items-center justify-between pl-2">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[18px]">warning</span>
          <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider">Surfaces Needing Attention</span>
        </div>
        {warning ? <span className="font-code-md text-code-md text-outline">{formatGenerationStamp(warning.latest, timeZone)}</span> : null}
      </div>
      <div className="pl-2 font-body-md text-body-md text-on-surface font-medium">
        Surfaces needing attention: <span className="text-primary font-bold">{name}</span>
        {" — "}
        {surface.total} generations · {surface.edited} edited · {surface.rejected} rejected · {countWord(surface.retryCount, "retry", "retries")}
        {surface.topWarning ? ` · Top warning: ${surface.topWarning}` : ""}
      </div>
      {warning ? (
        <div className="pl-2 font-code-md text-code-md text-on-surface-variant">
          Common warning: <span className="text-on-surface">{warning.text} — {warning.count}</span>
          {" · "}
          {warning.surfaces.map((id) => surfaceName(profile, id)).join(" · ")}
          {" · "}
          {countWord(warning.retryCount, "retry", "retries")} · {formatGenerationStamp(warning.latest, timeZone)}
        </div>
      ) : null}
    </div>
  );
}

function Archive({ days, clear }: { days: number; clear: boolean }) {
  return (
    <div className="bg-surface-container-lowest/60 rounded-xl p-space-lg flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
          Temporal Archive Log (Last {days} days)
        </span>
        {clear ? <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">All Clear</span> : null}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-space-xs">
        <EmptyCheck text="No learnings in this period." />
        <EmptyCheck text="No gold examples in this period." />
        <EmptyCheck text="No claim warnings logged." />
      </div>
    </div>
  );
}

function EmptyCheck({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-space-sm text-on-surface-variant bg-surface-container-low/50 p-space-sm rounded-lg">
      <span className="material-symbols-outlined text-outline text-[18px]">check</span>
      <span className="font-code-md text-code-md">{text}</span>
    </div>
  );
}

function Insight({
  text,
  label,
  dot,
  textTone,
  labelTone = "text-outline",
  shaded = false,
}: {
  text: string;
  label: string;
  dot: string;
  textTone: string;
  labelTone?: string;
  shaded?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1 px-space-sm ${shaded ? "bg-surface-container-low/40 rounded" : ""}`}>
      <span className={`font-code-md text-code-md flex items-center gap-2 ${textTone}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {text}
      </span>
      <span className={`font-label-sm text-label-sm uppercase ${labelTone}`}>{label}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  icon,
  labelTone,
  valueTone,
  captionTone,
  bar,
  span = false,
}: {
  label: string;
  value: string;
  caption: string;
  icon: string;
  labelTone: string;
  valueTone: string;
  captionTone: string;
  bar?: string;
  span?: boolean;
}) {
  const pad = bar ? "pl-1" : "";
  return (
    <div
      className={`bg-surface-container p-space-md rounded-xl flex flex-col gap-1 shadow-sm relative overflow-hidden ${span ? "col-span-2 sm:col-span-1" : ""}`}
    >
      {bar ? <div className={`w-1 absolute left-0 top-0 bottom-0 ${bar}`} /> : null}
      <div className={`flex items-center justify-between ${pad}`}>
        <span className={`font-label-sm text-label-sm uppercase tracking-wider ${labelTone}`}>{label}</span>
        <span className={`material-symbols-outlined text-[16px] ${labelTone}`}>{icon}</span>
      </div>
      <div className={`font-headline-md text-headline-md font-serif ${pad} ${valueTone}`}>{value}</div>
      <span className={`font-code-md text-code-md ${pad} ${captionTone}`}>{caption}</span>
    </div>
  );
}
