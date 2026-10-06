"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Profile } from "@/lib/types";

export function HerWritingForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [surface, setSurface] = useState(profile.surfaces[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addWriting(form: FormData) {
    setNotice(null);
    setSaving(true);
    try {
      form.set("surface", surface);
      form.set("sourceTitle", sourceTitle);
      form.set("text", text);
      const response = await fetch(`/api/profiles/${profile.id}/writing`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { added?: number; skipped?: number; error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Could not add her writing.");
        return;
      }
      const added = payload.added ?? 0;
      const skipped = payload.skipped ?? 0;
      const golds = added === 1 ? "1 gold" : `${added} golds`;
      setText("");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice(
        skipped > 0 ? `Added ${golds}. Skipped ${skipped} already saved.` : `Added ${golds}.`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="w-full mb-space-xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void addWriting(new FormData(event.currentTarget));
        }}
      >
        <div className="flex flex-col gap-space-sm mb-space-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[20px]">upload_file</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Add her writing</h2>
          </div>
          <div className="flex items-center p-1 rounded-lg bg-surface-container-lowest">
            {profile.surfaces.map((item) => (
              <button
                key={item.id}
                aria-label={`Use her writing on ${item.label}`}
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
        <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-8 flex flex-col">
              <label className="font-label-lg text-label-lg text-primary uppercase tracking-wider mb-space-sm" htmlFor="her-writing-title">
                What she wrote
              </label>
              <input
                className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-md py-2.5 mb-space-sm focus:outline-none placeholder:text-outline-variant"
                id="her-writing-title"
                placeholder="Pellet usage guide, 1 Oct 2026"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
              />
              <textarea
                className="w-full min-h-36 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg p-space-md focus:outline-none placeholder:text-outline-variant resize-none"
                placeholder="Paste a page she wrote"
                rows={5}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col justify-between gap-space-md">
              <div>
                <span className="font-label-lg text-label-lg text-primary uppercase tracking-wider mb-space-sm block">PDF</span>
                <input
                  ref={fileRef}
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  name="file"
                  type="file"
                  onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
                />
                <button
                  className="w-full px-space-lg py-2.5 rounded-lg bg-surface-container-highest text-on-surface hover:text-primary font-label-lg text-label-lg"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose PDF
                </button>
                <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant truncate">
                  {fileName ?? "No file yet"}
                </p>
              </div>
              <div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
                  A PDF or a paste becomes gold examples. It does not create a learning.
                </p>
                <button
                  className="w-full px-space-lg py-2.5 rounded-lg bg-primary-container text-on-primary-container font-label-lg text-label-lg font-bold disabled:opacity-50"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Adding…" : "Add as golds"}
                </button>
              </div>
            </div>
          </div>
        </div>
        {notice ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-md">{notice}</p> : null}
      </form>
    </section>
  );
}
