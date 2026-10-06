import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/profiles/[id]/writing/route";
import { textFromPdf } from "./pdf-text";
import { addHerWriting, getProfile } from "./store";

vi.mock("./store", async () => {
  const actual = await vi.importActual<typeof import("./store")>("./store");
  return { ...actual, getProfile: vi.fn(), addHerWriting: vi.fn() };
});

vi.mock("./pdf-text", async () => {
  const actual = await vi.importActual<typeof import("./pdf-text")>("./pdf-text");
  return { ...actual, textFromPdf: vi.fn() };
});

const profile = {
  id: "woolgrown",
  surfaces: [{ id: "blog", label: "Blog", maxWords: null, hint: "" }],
};

function request(body: unknown) {
  return new Request("http://127.0.0.1:3030/api/profiles/woolgrown/writing", {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:3030" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profiles/:id/writing", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockReset();
    vi.mocked(addHerWriting).mockReset();
    vi.mocked(getProfile).mockResolvedValue(profile as never);
    vi.mocked(addHerWriting).mockResolvedValue({ added: 1, skipped: 0 });
    vi.mocked(textFromPdf).mockReset();
  });

  it("saves her sentences as golds on the chosen surface", async () => {
    const response = await POST(
      request({
        text: "Wool pellets are a natural fibre mulch made from raw Canadian wool. They hold moisture in the soil.",
        sourceTitle: "Pellet usage guide, 1 Oct 2026",
        surface: "blog",
      }),
      { params: Promise.resolve({ id: "woolgrown" }) },
    );
    expect(response.status).toBe(200);
    expect(addHerWriting).toHaveBeenCalledWith({
      profileId: "woolgrown",
      passages: [
        "Wool pellets are a natural fibre mulch made from raw Canadian wool.",
      ],
      sourceTitle: "Pellet usage guide, 1 Oct 2026",
      surface: "blog",
    });
  });

  it("refuses writing with no usable sentence", async () => {
    const response = await POST(
      request({ text: "WOOLGROWN", surface: "blog" }),
      { params: Promise.resolve({ id: "woolgrown" }) },
    );
    expect(response.status).toBe(400);
    expect(addHerWriting).not.toHaveBeenCalled();
  });

  it("uses the profile's first surface when none is chosen", async () => {
    const response = await POST(
      request({
        text: "Wool pellets are a natural fibre mulch made from raw Canadian wool.",
      }),
      { params: Promise.resolve({ id: "woolgrown" }) },
    );
    expect(response.status).toBe(200);
    expect(addHerWriting).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "blog" }),
    );
  });

  it("reads a PDF upload into golds", async () => {
    vi.mocked(textFromPdf).mockResolvedValue(
      "Wool pellets are a natural fibre mulch made from raw Canadian wool.",
    );
    const form = new FormData();
    form.set("file", new File(["%PDF-1.4"], "guide.pdf", { type: "application/pdf" }));
    form.set("sourceTitle", "Pellet usage guide, 1 Oct 2026");
    form.set("surface", "blog");
    const response = await POST(formRequest(form), { params: Promise.resolve({ id: "woolgrown" }) });
    expect(response.status).toBe(200);
    expect(textFromPdf).toHaveBeenCalled();
    expect(addHerWriting).toHaveBeenCalledWith({
      profileId: "woolgrown",
      passages: ["Wool pellets are a natural fibre mulch made from raw Canadian wool."],
      sourceTitle: "Pellet usage guide, 1 Oct 2026",
      surface: "blog",
    });
  });

  it("refuses a file that is not a PDF", async () => {
    const form = new FormData();
    form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
    const response = await POST(formRequest(form), { params: Promise.resolve({ id: "woolgrown" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "File must be a PDF" });
    expect(textFromPdf).not.toHaveBeenCalled();
    expect(addHerWriting).not.toHaveBeenCalled();
  });

  it("refuses an empty upload", async () => {
    const response = await POST(formRequest(new FormData()), {
      params: Promise.resolve({ id: "woolgrown" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Add a PDF or paste her writing." });
    expect(addHerWriting).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown profile", async () => {
    vi.mocked(getProfile).mockRejectedValue(new Error("Unknown profile: missing"));
    const response = await POST(
      request({ text: "Wool pellets are a natural fibre mulch made from raw Canadian wool." }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(response.status).toBe(404);
    expect(addHerWriting).not.toHaveBeenCalled();
  });
});

function formRequest(form: FormData) {
  return new Request("http://127.0.0.1:3030/api/profiles/woolgrown/writing", {
    method: "POST",
    headers: { host: "127.0.0.1:3030" },
    body: form,
  });
}
