import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/profiles/[id]/learn/route";
import { LearnModelError } from "@/lib/infer";
import { learnForProfile } from "@/lib/store";

vi.mock("@/lib/auth", () => ({ authorize: () => true }));
vi.mock("@/lib/store", () => ({ learnForProfile: vi.fn() }));

function request(body: unknown) {
  return new Request("http://127.0.0.1:3030/api/profiles/woolgrown/learn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "woolgrown" }) };

describe("POST /api/profiles/:id/learn", () => {
  beforeEach(() => {
    vi.mocked(learnForProfile).mockReset();
  });

  it("answers 502 when the learning model fails, so the host retries", async () => {
    vi.mocked(learnForProfile).mockRejectedValue(new LearnModelError(new Error("overloaded")));
    const response = await POST(request({ before: "a b c", after: "d e f" }), params);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Learning model failed: overloaded" });
  });

  it("answers 400 for bad input", async () => {
    const response = await POST(request({ keepAsGold: "yes" }), params);
    expect(response.status).toBe(400);
  });
});
