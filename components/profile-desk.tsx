"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Gold, Learning, Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  golds: Gold[];
  learnings: Learning[];
};

export function ProfileDesk({ profile, golds, learnings }: Props) {
  const router = useRouter();
  const [surface, setSurface] = useState(profile.surfaces[0]?.id ?? "other");
  const [facts, setFacts] = useState("");
  const [body, setBody] = useState("");
  const [baseline, setBaseline] = useState("");
  const [why, setWhy] = useState("");
  const [keepAsGold, setKeepAsGold] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

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
      };
      if (!response.ok || !payload.body) {
        setNotice(payload.error ?? "Could not draft.");
        return;
      }
      setBody(payload.body);
      setBaseline(payload.body);
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
    <div className="grid grid-2">
      <section className="card">
        <h2>Try a draft</h2>
        <p className="meta">Apps send facts. You work the mouth here.</p>
        <label>
          Surface
          <select value={surface} onChange={(event) => setSurface(event.target.value)}>
            {profile.surfaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Facts
          <textarea
            value={facts}
            onChange={(event) => setFacts(event.target.value)}
            placeholder="Only what the model is allowed to know."
          />
        </label>
        <label>
          Draft
          <textarea value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label>
          Why this version is better
          <input
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            placeholder="Optional standing rule."
          />
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={keepAsGold}
              onChange={(event) => setKeepAsGold(event.target.checked)}
            />{" "}
            Keep this whole draft as a gold example
          </span>
        </label>
        <div className="actions">
          <button className="ghost" type="button" disabled={drafting} onClick={() => void draftThis()}>
            {drafting ? "Drafting…" : "Draft this"}
          </button>
          <button className="primary" type="button" disabled={!body.trim()} onClick={() => void teach()}>
            Teach
          </button>
        </div>
        {notice ? <p className="meta">{notice}</p> : null}
      </section>
      <div className="grid">
        <section className="card tone-doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.guide}</ReactMarkdown>
        </section>
        <section className="card">
          <h2>Golds</h2>
          {golds.map((gold) => (
            <blockquote key={gold.id} className="quote">
              <p>
                <strong>{gold.title}</strong>
              </p>
              <p>{gold.body}</p>
            </blockquote>
          ))}
        </section>
        <section className="card">
          <h2>What you’ve taught it</h2>
          {learnings.length === 0 ? (
            <p className="meta">
              A real edit becomes one preference you can read. Tiny fixes do not teach.
            </p>
          ) : (
            <ul className="learnings">
              {learnings.map((learning) => (
                <li key={learning.id}>
                  <p>{learning.rule}</p>
                  <button className="ghost" type="button" onClick={() => void dismiss(learning.id)}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
