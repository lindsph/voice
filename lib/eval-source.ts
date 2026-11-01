/**
 * Leave-one-out for the voice eval: while a piece is being tested, Voice must not
 * see the golds or rules it learned from that same piece, or the test would be
 * copying its own answer.
 *
 * Golds carry no source column; hosts title them after the piece they came from
 * ("urban-home-garden 10", "Kept in the editor · urban-home-garden"). Rules carry
 * sourceDraftId.
 */

import type { Gold, Learning } from "./types";

export function goldFromSource(title: string, sourceId: string): boolean {
  const id = sourceId.trim();
  if (!id) return false;
  const t = title.trim();
  return t === id || t.startsWith(`${id} `) || t.endsWith(`· ${id}`);
}

export function leaveOutSource<G extends Pick<Gold, "title">, L extends Pick<Learning, "sourceDraftId">>(
  golds: G[],
  learnings: L[],
  sourceId: string | undefined,
): { golds: G[]; learnings: L[] } {
  const id = sourceId?.trim();
  if (!id) return { golds, learnings };
  return {
    golds: golds.filter((gold) => !goldFromSource(gold.title, id)),
    learnings: learnings.filter((learning) => learning.sourceDraftId !== id),
  };
}
