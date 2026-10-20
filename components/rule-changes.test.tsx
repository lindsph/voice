import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuleChange } from "@/lib/store";

import { RuleChanges } from "./rule-changes";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const replaced: RuleChange = {
  id: "tl-new",
  rule: "Refer to the product by brand name, not \"our\".",
  surface: "shop_faq",
  action: "replaced",
  reason: "Opposite of the live rule.",
  target: { id: "tl-our", rule: "Speak as \"our\" rather than naming the brand." },
  before: "Our felt is organic.",
  after: "WoolGrown felt is organic.",
  why: "",
  at: "2026-10-20T00:44:53.000Z",
  undoneAt: null,
};

describe("RuleChanges", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ undone: "replaced" }) })));
  });

  it("shows what happened, the older rule, the reason and the edit it came from", () => {
    render(<RuleChanges changes={[replaced]} days={30} />);
    const row = screen.getByRole("listitem", { name: replaced.rule });
    expect(within(row).getByText("Replaced an older rule")).toBeTruthy();
    expect(within(row).getByText(/Older rule: Speak as "our"/)).toBeTruthy();
    expect(within(row).getByText("Why: Opposite of the live rule.")).toBeTruthy();
    expect(within(row).getByText("Before: Our felt is organic.")).toBeTruthy();
  });

  it("undoes a change and refreshes", async () => {
    render(<RuleChanges changes={[replaced]} days={30} />);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0]).toEqual(["/api/learnings/tl-new/undo", { method: "POST" }]);
  });

  it("shows Undone instead of a button once undone, and an empty state", () => {
    const { rerender } = render(<RuleChanges changes={[{ ...replaced, undoneAt: "2026-10-20T12:00:00.000Z" }]} days={30} />);
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(screen.getByText("Undone")).toBeTruthy();
    rerender(<RuleChanges changes={[]} days={30} />);
    expect(screen.getByText("Nothing changed automatically in the last 30 days.")).toBeTruthy();
  });
});
