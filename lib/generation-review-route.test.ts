import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "../app/api/generations/[id]/route";
import { updateGenerationOutcome } from "./generation-log";

vi.mock("./generation-log", async () => {
  const actual = await vi.importActual<typeof import("./generation-log")>("./generation-log");
  return { ...actual, updateGenerationOutcome: vi.fn() };
});

function request(body: unknown) {
  return new Request("http://127.0.0.1:3030/api/generations/log-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", host: "127.0.0.1:3030" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/generations/:id", () => {
  beforeEach(() => {
    vi.mocked(updateGenerationOutcome).mockReset();
  });

  it("saves a kept mark", async () => {
    vi.mocked(updateGenerationOutcome).mockResolvedValue({
      id: "log-1",
      outcome: "kept",
    } as never);
    const response = await PATCH(request({ outcome: "kept", userNote: "Sounds like her." }), {
      params: Promise.resolve({ id: "log-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateGenerationOutcome).toHaveBeenCalledWith("log-1", {
      outcome: "kept",
      userNote: "Sounds like her.",
    });
  });

  it("returns 404 when the log is missing", async () => {
    vi.mocked(updateGenerationOutcome).mockRejectedValue(new Error("Unknown generation: log-1"));
    const response = await PATCH(request({ outcome: "rejected" }), {
      params: Promise.resolve({ id: "log-1" }),
    });
    expect(response.status).toBe(404);
  });
});
