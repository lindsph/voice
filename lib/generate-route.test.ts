import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/profiles/[id]/generate/route";
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
      reason: "Canonical example for this surface.",
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

  it("returns the draft trace with the body", async () => {
    vi.mocked(generateForProfile).mockResolvedValue({
      body: "Wool in the booth.",
      retried: true,
      bundle: "prompt",
      warnings: ["delve"],
      trace,
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
    });
    expect(generateForProfile).toHaveBeenCalledWith({
      profileId: "woolgrown",
      surface: "blog",
      facts: "Raised beds.",
      seed: "raised-beds",
      architecture: "how-to-steps",
      format: undefined,
      model: "claude-opus-4-6",
    });
  });
});
