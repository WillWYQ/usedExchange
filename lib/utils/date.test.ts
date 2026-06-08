import { describe, it, expect } from "vitest";
import { formatRelativeDate, formatAbsoluteDate } from "./date";

// All tests that need a stable "today" inject a fixed `now` so the suite is
// not time-sensitive and produces identical results in every environment.

describe("formatRelativeDate", () => {
  // ── null / empty input ──────────────────────────────────────────────────────

  it("returns '' for null", () => {
    expect(formatRelativeDate(null)).toBe("");
  });

  it("returns '' for an empty string", () => {
    expect(formatRelativeDate("")).toBe("");
  });

  // ── relative labels ─────────────────────────────────────────────────────────

  it("returns 'Today' when the date matches now", () => {
    const now = new Date(2026, 5, 5); // June 5 2026, local time
    expect(formatRelativeDate("2026-06-05", now)).toBe("Today");
  });

  it("returns '1 day ago' for yesterday", () => {
    const now = new Date(2026, 5, 5);
    expect(formatRelativeDate("2026-06-04", now)).toBe("1 day ago");
  });

  it("uses singular 'day' for exactly one day", () => {
    const now = new Date(2026, 5, 5);
    expect(formatRelativeDate("2026-06-04", now)).toMatch(/^1 day ago$/);
  });

  it("uses plural 'days' for more than one day", () => {
    const now = new Date(2026, 5, 5);
    expect(formatRelativeDate("2026-06-03", now)).toBe("2 days ago");
  });

  it("returns '7 days ago' for a week ago", () => {
    const now = new Date(2026, 5, 5); // June 5
    expect(formatRelativeDate("2026-05-29", now)).toBe("7 days ago"); // May 29
  });

  it("handles month boundaries correctly", () => {
    const now = new Date(2026, 2, 1); // March 1
    expect(formatRelativeDate("2026-02-28", now)).toBe("1 day ago");
  });

  it("handles year boundaries correctly", () => {
    const now = new Date(2026, 0, 2); // January 2
    expect(formatRelativeDate("2025-12-31", now)).toBe("2 days ago");
  });

  // ── future dates ─────────────────────────────────────────────────────────────

  it("returns '' for a future date", () => {
    const now = new Date(2026, 5, 5);
    expect(formatRelativeDate("2030-01-01", now)).toBe("");
  });

  it("returns '' for tomorrow", () => {
    const now = new Date(2026, 5, 5);
    expect(formatRelativeDate("2026-06-06", now)).toBe("");
  });

  // ── invalid / malformed input ────────────────────────────────────────────────

  it("returns '' for a string that doesn't match YYYY-MM-DD", () => {
    expect(formatRelativeDate("not-a-date")).toBe("");
  });

  it("returns '' for single-digit month (fails \\d{2} match)", () => {
    // "2026-6-5" does not match /^(\d{4})-(\d{2})-(\d{2})/
    expect(formatRelativeDate("2026-6-5")).toBe("");
  });

  it("returns '' for a date string with only a year", () => {
    expect(formatRelativeDate("2026")).toBe("");
  });

  // ── ISO timestamp input ──────────────────────────────────────────────────────

  it("accepts a full ISO timestamp and uses only the date portion", () => {
    const now = new Date(2026, 5, 5);
    // The schema strips timestamps to YYYY-MM-DD before storing, but
    // formatRelativeDate should also be robust to raw timestamps.
    expect(formatRelativeDate("2026-06-05T10:00:00Z", now)).toBe("Today");
  });
});

// formatAbsoluteDate is rendered in a Server Component at export time — it
// must produce an identical string regardless of the build runner's locale or
// timezone (the bug it replaces: `new Date(iso).toLocaleDateString()` would
// vary by CI machine and could shift a date-only string by a day).
describe("formatAbsoluteDate", () => {
  it("returns '' for null", () => {
    expect(formatAbsoluteDate(null)).toBe("");
  });

  it("returns '' for an empty string", () => {
    expect(formatAbsoluteDate("")).toBe("");
  });

  it("returns '' for malformed input", () => {
    expect(formatAbsoluteDate("not-a-date")).toBe("");
    expect(formatAbsoluteDate("2026-6-5")).toBe("");
    expect(formatAbsoluteDate("2026")).toBe("");
  });

  it("formats a YYYY-MM-DD string as a long-form English date", () => {
    expect(formatAbsoluteDate("2026-06-05")).toBe("June 5, 2026");
  });

  it("uses only the date portion of a full ISO timestamp", () => {
    expect(formatAbsoluteDate("2026-06-05T23:59:59Z")).toBe("June 5, 2026");
  });

  it("is stable across different process timezones (always renders the same calendar date)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      const a = formatAbsoluteDate("2026-01-31");
      process.env.TZ = "Etc/GMT+12"; // UTC-12
      const b = formatAbsoluteDate("2026-01-31");
      expect(a).toBe(b);
      expect(a).toBe("January 31, 2026");
    } finally {
      process.env.TZ = original;
    }
  });
});
