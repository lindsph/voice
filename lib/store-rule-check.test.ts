import { beforeEach, describe, expect, it, vi } from "vitest";

const learning = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
const transaction = vi.hoisted(() => vi.fn());
const decideNewRule = vi.hoisted(() => vi.fn());
const ruleCheckEnabled = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  prisma: {
    learning,
    gold: { findMany: vi.fn().mockResolvedValue([]) },
    profile: { findUnique: vi.fn().mockResolvedValue({ guide: "### How we make claims\n\n- Never absolute claims." }) },
    $transaction: transaction,
  },
}));
vi.mock("./rule-check", () => ({ decideNewRule, ruleCheckEnabled }));

import { learnForProfile, listRuleChanges, undoRuleChange } from "./store";

const live = [
  { id: "tl-our", rule: "Speak as \"our\" rather than naming the brand.", surface: "shop_faq" },
  { id: "tl-blog", rule: "No em-dash asides.", surface: "blog" },
];
const teach = { profileId: "woolgrown", surface: "shop_faq", why: "Use the brand name, not our." };

describe("learnForProfile with the rule check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The live-rule lookup selects fields; the closing listLearnings does not.
    learning.findMany.mockImplementation(async (args: { select?: unknown }) => (args.select ? live : []));
    ruleCheckEnabled.mockReturnValue(true);
  });

  it("checks only against live rules for the same surface", async () => {
    decideNewRule.mockResolvedValue({ verdict: "new", reason: "Adds detail." });
    const result = await learnForProfile(teach);
    expect(decideNewRule.mock.calls[0]![0].live).toEqual([{ id: "tl-our", rule: live[0]!.rule }]);
    expect(learning.create.mock.calls[0]![0].data).toMatchObject({ status: "active" });
    expect(learning.create.mock.calls[0]![0].data).not.toHaveProperty("autoAction");
    expect(result.learningCount).toBe(1);
  });

  it("lets a newer contradicting rule replace the old one, retiring it rather than deleting it", async () => {
    decideNewRule.mockResolvedValue({ verdict: "conflict", ruleId: "tl-our", reason: "Opposite." });
    const result = await learnForProfile(teach);
    expect(learning.create.mock.calls[0]![0].data).toMatchObject({
      status: "active",
      autoAction: "replaced",
      autoTargetId: "tl-our",
      autoReason: "Opposite.",
    });
    expect(learning.update).toHaveBeenCalledWith({
      where: { id: "tl-our" },
      data: expect.objectContaining({ status: "retired" }),
    });
    expect(result.learningCount).toBe(1);
  });

  it("holds back a rule that loosens claims, and a duplicate", async () => {
    decideNewRule.mockResolvedValueOnce({ verdict: "claims", reason: "Adds estimates." });
    expect((await learnForProfile(teach)).learningCount).toBe(0);
    expect(learning.create.mock.calls[0]![0].data).toMatchObject({ status: "blocked", autoAction: "blocked" });

    decideNewRule.mockResolvedValueOnce({ verdict: "duplicate", ruleId: "tl-our", reason: "Same." });
    expect((await learnForProfile(teach)).learningCount).toBe(0);
    expect(learning.create.mock.calls[1]![0].data).toMatchObject({ status: "merged", autoTargetId: "tl-our" });
    expect(learning.update).not.toHaveBeenCalled();
  });

  it("saves the rule live, as before, when the check is off", async () => {
    ruleCheckEnabled.mockReturnValue(false);
    await learnForProfile(teach);
    expect(decideNewRule).not.toHaveBeenCalled();
    expect(learning.create.mock.calls[0]![0].data.status).toBe("active");
  });
});

describe("rule changes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists changes with the rule each one replaced", async () => {
    const at = new Date("2026-10-20T00:45:00Z");
    learning.findMany
      .mockResolvedValueOnce([
        {
          id: "tl-new",
          rule: "Use the brand name.",
          surface: "shop_faq",
          autoAction: "replaced",
          autoReason: "Opposite.",
          autoTargetId: "tl-our",
          autoAt: at,
          createdAt: at,
          undoneAt: null,
          before: "",
          after: "",
          why: "",
        },
      ])
      .mockResolvedValueOnce([{ id: "tl-our", rule: "Speak as our." }]);
    const [change] = await listRuleChanges("woolgrown");
    expect(change).toMatchObject({ action: "replaced", target: { id: "tl-our", rule: "Speak as our." }, undoneAt: null });
  });

  it("undoes a replacement by bringing the old rule back and dismissing the new one", async () => {
    learning.findUnique.mockResolvedValue({ id: "tl-new", autoAction: "replaced", autoTargetId: "tl-our", undoneAt: null });
    learning.update.mockImplementation((args) => args);
    expect(await undoRuleChange("tl-new")).toBe("replaced");
    const writes = transaction.mock.calls[0]![0];
    expect(writes).toEqual([
      { where: { id: "tl-new" }, data: expect.objectContaining({ status: "dismissed" }) },
      { where: { id: "tl-our" }, data: expect.objectContaining({ status: "active" }) },
    ]);
  });

  it("undoes a held rule by making it live, and does nothing the second time", async () => {
    learning.findUnique.mockResolvedValueOnce({ id: "tl-held", autoAction: "blocked", undoneAt: null });
    await undoRuleChange("tl-held");
    expect(learning.update).toHaveBeenCalledWith({ where: { id: "tl-held" }, data: expect.objectContaining({ status: "active" }) });

    learning.update.mockClear();
    learning.findUnique.mockResolvedValueOnce({ id: "tl-held", autoAction: "blocked", undoneAt: new Date() });
    await undoRuleChange("tl-held");
    expect(learning.update).not.toHaveBeenCalled();
  });

  it("refuses to undo a rule the check never touched", async () => {
    learning.findUnique.mockResolvedValue({ id: "tl-plain", autoAction: null });
    await expect(undoRuleChange("tl-plain")).rejects.toThrow(/Not an automatic change/);
  });
});
