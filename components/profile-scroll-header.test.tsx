import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileScrollHeader } from "./profile-scroll-header";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function rect(bottom: number, height = 160): DOMRect {
  return {
    x: 0,
    y: bottom - height,
    width: 800,
    height,
    top: bottom - height,
    right: 800,
    bottom,
    left: 0,
    toJSON() {
      return {};
    },
  };
}

describe("ProfileScrollHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Voice and Projects while the project title is still on screen", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect(this: HTMLElement) {
      if (this.id === "project-hero") return rect(400);
      return rect(0, 0);
    });
    render(
      <>
        <div id="project-hero" />
        <ProfileScrollHeader name="WoolGrown" description="Garden wool." surfaces="Blog · Shop FAQ" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "WoolGrown" })).not.toBeInTheDocument();
  });

  it("fades the project into the bar once the title scrolls under it", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect(this: HTMLElement) {
      if (this.id === "project-hero") return rect(80);
      return rect(0, 0);
    });
    render(
      <>
        <div id="project-hero" />
        <ProfileScrollHeader name="WoolGrown" description="Garden wool." surfaces="Blog · Shop FAQ" />
      </>,
    );
    expect(screen.queryByRole("link", { name: "Voice" })).not.toBeInTheDocument();
    expect(screen.getByText("WoolGrown")).toBeInTheDocument();
    expect(screen.getByText("Garden wool.")).toBeInTheDocument();
    expect(screen.getByText("Surfaces: Blog · Shop FAQ")).toBeInTheDocument();
  });

  it("leaves Voice and Projects in place when the title has no height", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect(this: HTMLElement) {
      if (this.id === "project-hero") return rect(0, 0);
      return rect(0, 0);
    });
    render(
      <>
        <div id="project-hero" />
        <ProfileScrollHeader name="WoolGrown" description="Garden wool." surfaces="Blog · Shop FAQ" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByText("WoolGrown").closest("[aria-hidden='true']")).toBeTruthy();
  });
});
