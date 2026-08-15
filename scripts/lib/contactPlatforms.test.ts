import { describe, expect, it } from "vitest";
import { readContactPlatforms, writeContactPlatformQrImage } from "./contactPlatforms";

const SOURCE = `export const siteConfig: SiteConfig = {
  name: "Test",
  contact: {
    reveal_behavior: "click",
    platforms: [
      { type: "email", value: "you@example.com" },
      { type: "venmo", value: "your_username" },
      { type: "zelle", qr_image: "/contact/zelle-qr.png", label: "Zelle" },
    ],
  },
};
`;

describe("readContactPlatforms", () => {
  it("returns [] when there is no contact.platforms array", () => {
    expect(readContactPlatforms("export const siteConfig = { name: \"x\" };")).toEqual([]);
  });

  it("reads type/value/label/qrImage for every element", () => {
    expect(readContactPlatforms(SOURCE)).toEqual([
      { index: 0, type: "email", value: "you@example.com", label: undefined, qrImage: undefined },
      { index: 1, type: "venmo", value: "your_username", label: undefined, qrImage: undefined },
      { index: 2, type: "zelle", value: undefined, label: "Zelle", qrImage: "/contact/zelle-qr.png" },
    ]);
  });
});

describe("writeContactPlatformQrImage", () => {
  it("replaces an existing qr_image value in place", () => {
    const next = writeContactPlatformQrImage(SOURCE, 2, "/contact/zelle-qr-2.png");
    expect(readContactPlatforms(next)[2]).toEqual({
      index: 2,
      type: "zelle",
      value: undefined,
      label: "Zelle",
      qrImage: "/contact/zelle-qr-2.png",
    });
    // Nothing else in the file moved.
    expect(next).toContain('{ type: "email", value: "you@example.com" }');
  });

  it("inserts qr_image and a default label into a platform that has neither", () => {
    const next = writeContactPlatformQrImage(SOURCE, 1, "/contact/venmo-qr.png");
    expect(readContactPlatforms(next)[1]).toEqual({
      index: 1,
      type: "venmo",
      value: "your_username",
      label: "Venmo",
      qrImage: "/contact/venmo-qr.png",
    });
  });

  it("inserts only qr_image when a label already exists but qr_image doesn't", () => {
    const withLabel = SOURCE.replace(
      '{ type: "venmo", value: "your_username" }',
      '{ type: "venmo", value: "your_username", label: "My Venmo" }',
    );
    const next = writeContactPlatformQrImage(withLabel, 1, "/contact/venmo-qr.png");
    expect(readContactPlatforms(next)[1]).toEqual({
      index: 1,
      type: "venmo",
      value: "your_username",
      label: "My Venmo",
      qrImage: "/contact/venmo-qr.png",
    });
  });

  it("throws for an out-of-range index", () => {
    expect(() => writeContactPlatformQrImage(SOURCE, 99, "/contact/x.png")).toThrow(/does not exist/);
  });

  it("throws when there is no contact.platforms array at all", () => {
    expect(() =>
      writeContactPlatformQrImage("export const siteConfig = { name: \"x\" };", 0, "/contact/x.png"),
    ).toThrow(/no contact.platforms array/);
  });
});
