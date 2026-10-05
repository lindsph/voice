import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "../app/api/golds/[id]/route";
import { updateGold } from "./store";

vi.mock("./store", async () => {
  const actual = await vi.importActual<typeof import("./store")>("./store");
  return { ...actual, updateGold: vi.fn() };
});

function request(body: unknown) {
  return new Request("http://127.0.0.1:3030/api/golds/gold-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", host: "127.0.0.1:3030" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/golds/:id", () => {
  beforeEach(() => {
    vi.mocked(updateGold).mockReset();
  });

  it("saves whether the gold is used in drafts", async () => {
    vi.mocked(updateGold).mockResolvedValue({ id: "gold-1", canonical: false } as never);
    const response = await PATCH(request({ canonical: false }), { params: Promise.resolve({ id: "gold-1" }) });
    expect(response.status).toBe(200);
    expect(updateGold).toHaveBeenCalledWith("gold-1", { canonical: false });
  });

  it("saves the text, surface, and architecture", async () => {
    vi.mocked(updateGold).mockResolvedValue({ id: "gold-1" } as never);
    const response = await PATCH(
      request({ body: "Line them with fleece.", surface: "shop_faq", architecture: "faq" }),
      { params: Promise.resolve({ id: "gold-1" }) },
    );
    expect(response.status).toBe(200);
    expect(updateGold).toHaveBeenCalledWith("gold-1", {
      body: "Line them with fleece.",
      surface: "shop_faq",
      architecture: "faq",
    });
  });

  it("rejects an empty change", async () => {
    const response = await PATCH(request({}), { params: Promise.resolve({ id: "gold-1" }) });
    expect(response.status).toBe(400);
    expect(updateGold).not.toHaveBeenCalled();
  });

  it("rejects a caller without access", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNode = env.NODE_ENV;
    const prevSecret = env.VOICE_API_SECRET;
    env.NODE_ENV = "production";
    env.VOICE_API_SECRET = "test-secret";
    const response = await PATCH(
      new Request("http://lindsay-voice.fly.dev/api/golds/gold-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", host: "lindsay-voice.fly.dev" },
        body: JSON.stringify({ canonical: true }),
      }),
      { params: Promise.resolve({ id: "gold-1" }) },
    );
    env.NODE_ENV = prevNode;
    if (prevSecret === undefined) delete env.VOICE_API_SECRET;
    else env.VOICE_API_SECRET = prevSecret;
    expect(response.status).toBe(401);
    expect(updateGold).not.toHaveBeenCalled();
  });

  it("returns 404 when the gold is missing", async () => {
    vi.mocked(updateGold).mockRejectedValue(new Error("Unknown gold: gold-1"));
    const response = await PATCH(request({ canonical: true }), { params: Promise.resolve({ id: "gold-1" }) });
    expect(response.status).toBe(404);
  });
});
