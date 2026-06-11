// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { PlatformButton } from "./PlatformButton";
import type { Platform } from "@/lib/config/types";

afterEach(cleanup);

function hrefFor(platform: Platform): string {
  render(<PlatformButton platform={platform} />);
  const link = screen.getByRole("link") as HTMLAnchorElement;
  return link.getAttribute("href")!;
}

describe("PlatformButton — Facebook links", () => {
  it("builds a profile URL from a bare username", () => {
    expect(hrefFor({ type: "facebook", value: "your.username" })).toBe(
      "https://facebook.com/your.username",
    );
  });

  it("normalizes a pasted full profile URL instead of double-encoding it", () => {
    expect(
      hrefFor({ type: "facebook", value: "https://www.facebook.com/your.username" }),
    ).toBe("https://facebook.com/your.username");
  });

  it("preserves the query string for profile.php?id= URLs", () => {
    expect(
      hrefFor({
        type: "facebook",
        value: "https://www.facebook.com/profile.php?id=100012345678",
      }),
    ).toBe("https://facebook.com/profile.php?id=100012345678");
  });
});

describe("PlatformButton — LinkedIn links", () => {
  it("preserves the '/' in an 'in/<id>' path instead of encoding it to %2F", () => {
    expect(hrefFor({ type: "linkedin", value: "in/your-name" })).toBe(
      "https://linkedin.com/in/your-name",
    );
  });

  it("defaults a bare handle to a personal profile ('in/')", () => {
    expect(hrefFor({ type: "linkedin", value: "your-name" })).toBe(
      "https://linkedin.com/in/your-name",
    );
  });

  it("normalizes a pasted full profile URL", () => {
    expect(
      hrefFor({ type: "linkedin", value: "https://www.linkedin.com/in/your-name" }),
    ).toBe("https://linkedin.com/in/your-name");
  });

  it("preserves a 'company/' path without adding 'in/'", () => {
    expect(hrefFor({ type: "linkedin", value: "company/acme" })).toBe(
      "https://linkedin.com/company/acme",
    );
  });
});
