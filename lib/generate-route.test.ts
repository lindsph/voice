import { beforeEach, describe, expect, it, vi } from "vitest";

import { maxDuration, POST } from "../app/api/profiles/[id]/generate/route";
import { DRAFT_ERROR, generateErrorStatus, publicDraftError } from "./generate-error";
import { generateForProfile } from "@/lib/store";
import type { DraftTrace } from "./types";

vi.mock("@/lib/store", () => ({
  generateForProfile: vi.fn(),
}));

const trace: DraftTrace = {
  profileId: "woolgrown",
  surfaceId: "blog",
  model: "claude-opus-4-6",
  factsCharacterCount: 12,
  selectedGoldIds: ["woolgrown-howto"],
  selectedLearningIds: ["tl-123"],
  bannedPhrasesChecked: ["guaranteed", "delve"],
  seed: "raised-beds",
  architecture: "how-to-steps",
  retryReason: "banned_phrase:delve",
  selectedGolds: [
    {
      id: "woolgrown-howto",
      title: "How to",
      reason: "Gold example for this surface.",
    },
  ],
  selectedLearnings: [
    {
      id: "tl-123",
      rule: "Name the bed.",
      reason: "Same surface, closest to these facts.",
    },
  ],
};

function request(body: unknown) {
  return new Request("http://127.0.0.1:3030/api/profiles/woolgrown/generate", {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:3030" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profiles/:id/generate", () => {
  beforeEach(() => {
    vi.mocked(generateForProfile).mockReset();
  });

  it("passes the host's tone guide through to the generator", async () => {
    vi.mocked(generateForProfile).mockResolvedValue({
      body: "Wool in the booth.",
      retried: false,
      bundle: "prompt",
      warnings: [],
      trace,
      generationId: null,
    });
    await POST(request({ surface: "blog", facts: "Raised beds.", guide: "## Who we sound like\n\nRepo guide." }), {
      params: Promise.resolve({ id: "woolgrown" }),
    });
    expect(vi.mocked(generateForProfile).mock.calls[0]?.[0].guide).toBe("## Who we sound like\n\nRepo guide.");
  });

  it("returns the draft trace and log id with the body", async () => {
    vi.mocked(generateForProfile).mockResolvedValue({
      body: "Wool in the booth.",
      retried: true,
      bundle: "prompt",
      warnings: ["delve"],
      trace,
      generationId: "gen-1",
    });
    const response = await POST(request({
      surface: "blog",
      facts: "Raised beds.",
      seed: "raised-beds",
      architecture: "how-to-steps",
      model: "claude-opus-4-6",
    }), { params: Promise.resolve({ id: "woolgrown" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      body: "Wool in the booth.",
      retried: true,
      warnings: ["delve"],
      trace,
      generationId: "gen-1",
    });
    expect(generateForProfile).toHaveBeenCalledWith({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      seed: "raised-beds",
      architecture: "how-to-steps",
      format: undefined,
      task: undefined,
      model: "claude-opus-4-6",
    });
  });

  it("returns Claude’s timeout message and status", async () => {
    vi.mocked(generateForProfile).mockRejectedValue(
      Object.assign(new Error("Claude draft timed out after 4 minutes (claude-opus-4-6)."), {
        status: 504,
      }),
    );
    const response = await POST(request({ surface: "blog", facts: "Raised beds." }), {
      params: Promise.resolve({ id: "woolgrown" }),
    });
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "Claude draft timed out after 4 minutes (claude-opus-4-6).",
    });
  });

  it("never sends the provider's raw reply to the person drafting, and logs it instead", async () => {
    const raw =
      'Claude draft failed (400): {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_1"}';
    vi.mocked(generateForProfile).mockRejectedValue(Object.assign(new Error(raw), { status: 400 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request({ surface: "blog", facts: "Raised beds." }), {
        params: Promise.resolve({ id: "woolgrown" }),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: DRAFT_ERROR.noCredit });
      expect(JSON.stringify(body)).not.toContain("request_id");
      expect(log).toHaveBeenCalledWith(`[generate] ${raw}`);
    } finally {
      log.mockRestore();
    }
  });

  it("turns each kind of model failure into a plain sentence", () => {
    const err = (message: string, status?: number) =>
      [status === undefined ? new Error(message) : Object.assign(new Error(message), { status }), message] as const;
    expect(publicDraftError(...err("Claude draft failed (400): Your credit balance is too low", 400))).toBe(DRAFT_ERROR.noCredit);
    expect(publicDraftError(...err('Claude draft failed (401): {"error":{"type":"authentication_error"}}', 401))).toBe(DRAFT_ERROR.key);
    expect(publicDraftError(...err("Add ANTHROPIC_API_KEY to Voice’s .env."))).toBe(DRAFT_ERROR.key);
    expect(publicDraftError(...err("Claude draft failed (529): overloaded", 529))).toBe(DRAFT_ERROR.busy);
    expect(publicDraftError(...err("Claude draft failed (429): rate_limit_error", 429))).toBe(DRAFT_ERROR.busy);
    expect(publicDraftError(...err("Claude draft failed (500): internal", 500))).toBe(DRAFT_ERROR.server);
    expect(publicDraftError(...err('Claude draft failed (404): {"error":{"message":"model not found"}}', 404))).toBe(DRAFT_ERROR.other);
    expect(publicDraftError(...err("The model returned an empty draft."))).toBe(DRAFT_ERROR.other);
    expect(publicDraftError(...err("Claude draft timed out after 4 minutes (claude-opus-4-6).", 504))).toBe(
      "Claude draft timed out after 4 minutes (claude-opus-4-6).",
    );
  });

  it("keeps a missing model key unavailable", () => {
    expect(maxDuration).toBe(600);
    expect(
      generateErrorStatus(new Error("Add ANTHROPIC_API_KEY to Voice’s .env."), "Add ANTHROPIC_API_KEY to Voice’s .env."),
    ).toBe(503);
    expect(generateErrorStatus(new Error("Could not generate"), "Could not generate")).toBe(400);
    expect(generateErrorStatus(Object.assign(new Error("nope"), { status: 200 }), "nope")).toBe(400);
  });
});
