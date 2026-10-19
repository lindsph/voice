import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/profiles/[id]/generations/route";
import { listSurfaceDrafts } from "./generation-log";

vi.mock("./generation-log", async () => {
  const actual = await vi.importActual<typeof import("./generation-log")>("./generation-log");
  return { ...actual, listSurfaceDrafts: vi.fn() };
});

function request(query: string, host = "127.0.0.1:3030") {
  return new Request(`http://127.0.0.1:3030/api/profiles/woolgrown/generations${query}`, { headers: { host } });
}

describe("GET /api/profiles/:id/generations", () => {
  beforeEach(() => vi.mocked(listSurfaceDrafts).mockReset());

  it("lists the drafts on one surface", async () => {
    vi.mocked(listSurfaceDrafts).mockResolvedValue([
      {
        id: "gen-1",
        createdAt: "2026-10-19T12:00:00.000Z",
        style: "crafted",
        angle: "A balcony at six.",
        facts: "Angle: lead with watering less.",
        generatedBody: "Pots dry out.\n\nHeadline: Water Less",
        editedBody: null,
        outcome: "kept",
      },
    ]);
    const response = await GET(request("?surface=ad"), { params: Promise.resolve({ id: "woolgrown" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).drafts).toHaveLength(1);
    expect(listSurfaceDrafts).toHaveBeenCalledWith("woolgrown", "ad");
  });

  it("needs a surface", async () => {
    const response = await GET(request(""), { params: Promise.resolve({ id: "woolgrown" }) });
    expect(response.status).toBe(400);
    expect(listSurfaceDrafts).not.toHaveBeenCalled();
  });
});
