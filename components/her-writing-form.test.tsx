import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Profile } from "@/lib/types";

import { HerWritingForm } from "./her-writing-form";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const profile: Profile = {
  id: "woolgrown",
  name: "WoolGrown",
  description: "Maker",
  guide: "Practical.",
  systemPrompt: "Write.",
  bannedForPrompt: [],
  surfaces: [
    { id: "blog", label: "Blog", maxWords: null, hint: "A post." },
    { id: "shop_faq", label: "Shop FAQ", maxWords: 120, hint: "A short answer." },
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("her writing form", () => {
  it("posts a paste as her writing", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as FormData;
      expect(body.get("text")).toBe(
        "Wool pellets are a natural fibre mulch made from raw Canadian wool.",
      );
      expect(body.get("surface")).toBe("shop_faq");
      expect(body.get("sourceTitle")).toBe("Pellet guide");
      return {
        ok: true,
        json: async () => ({ added: 1, skipped: 0 }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HerWritingForm profile={profile} />);
    fireEvent.change(screen.getByPlaceholderText("Pellet usage guide, 1 Oct 2026"), {
      target: { value: "Pellet guide" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste a page she wrote"), {
      target: { value: "Wool pellets are a natural fibre mulch made from raw Canadian wool." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use her writing on Shop FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Add as golds" }));

    expect(await screen.findByText("Added 1 gold.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/woolgrown/writing", expect.objectContaining({ method: "POST" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the chosen PDF and clears it after the golds are saved", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ added: 2, skipped: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HerWritingForm profile={profile} />);
    fireEvent.change(screen.getByPlaceholderText("Paste a page she wrote"), {
      target: { value: "Wool pellets are a natural fibre mulch made from raw Canadian wool." },
    });
    const input = document.querySelector('input[name="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["%PDF-"], "guide.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByText("guide.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add as golds" }));

    expect(await screen.findByText("Added 2 golds. Skipped 1 already saved.")).toBeInTheDocument();
    expect(screen.getByText("No file yet")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/woolgrown/writing", expect.objectContaining({ method: "POST" }));
    expect(refresh).toHaveBeenCalled();
  });
});
