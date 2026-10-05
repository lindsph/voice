import type { DraftTrace, Profile } from "@/lib/types";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function modelLabel(model: string): string {
  const trimmed = model.trim();
  const claude = trimmed.match(/^claude-([a-z]+)-(\d+)-(\d+)$/i);
  if (claude?.[1] && claude[2] && claude[3]) {
    const family = claude[1];
    const name = family.charAt(0).toUpperCase() + family.slice(1).toLowerCase();
    return `Claude ${name} ${claude[2]}.${claude[3]}`;
  }
  if (trimmed.toLowerCase() === "gpt-4o") return "GPT-4o";
  return trimmed;
}

export function retryLabel(reason: string): string {
  return reason
    .split("; ")
    .map((part) => {
      const match = /^banned_phrase:(.+)$/.exec(part);
      return match?.[1] ? `banned phrase “${match[1]}”` : part;
    })
    .join("; ");
}

function CountLine({
  label,
  items,
}: {
  label: string;
  items: { key: string; title: string; detail?: string }[];
}) {
  if (items.length === 0) return <li>{label}</li>;
  return (
    <li>
      <details>
        <summary>{label}</summary>
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              {item.title}
              {item.detail ? <span className="trace-reason">{item.detail}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export function DraftTracePanel({
  trace,
  profile,
  warnings,
}: {
  trace: DraftTrace;
  profile: Profile;
  warnings: string[];
}) {
  const surface = profile.surfaces.find((item) => item.id === trace.surfaceId);
  return (
    <details className="trace">
      <summary>Why this draft?</summary>
      <ul>
        <li>
          {profile.name} · {surface?.label ?? trace.surfaceId}
        </li>
        <li>
          Facts: {countLabel(trace.factsCharacterCount, "character", "characters")}
        </li>
        {trace.seed && trace.seed !== trace.surfaceId ? <li>Seed: {trace.seed}</li> : null}
        {trace.architecture ? <li>Architecture: {trace.architecture}</li> : null}
        <CountLine
          label={`Used ${countLabel(trace.selectedGolds.length, "gold example", "gold examples")}`}
          items={trace.selectedGolds.map((gold) => ({
            key: gold.id,
            title: gold.title,
            detail: gold.reason,
          }))}
        />
        <CountLine
          label={`Applied ${countLabel(trace.selectedLearnings.length, "learning rule", "learning rules")}`}
          items={trace.selectedLearnings.map((learning) => ({
            key: learning.id,
            title: learning.rule,
            detail: learning.reason,
          }))}
        />
        <CountLine
          label={`Checked ${countLabel(trace.bannedPhrasesChecked.length, "banned phrase", "banned phrases")}`}
          items={trace.bannedPhrasesChecked.map((phrase) => ({ key: phrase, title: phrase }))}
        />
        <li>Model: {modelLabel(trace.model)}</li>
        {trace.retryReason ? <li>Retry: {retryLabel(trace.retryReason)}</li> : null}
        {warnings.length > 0 ? (
          <li>Warnings: {warnings.join("; ")}</li>
        ) : null}
      </ul>
    </details>
  );
}
