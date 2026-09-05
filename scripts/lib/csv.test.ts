import { describe, it, expect } from "vitest";
import { csvCell, toCsvString } from "./csv";

describe("csvCell", () => {
  it("leaves a plain value unquoted", () => {
    expect(csvCell("hello")).toBe("hello");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsvString", () => {
  it("joins headers and rows with CRLF", () => {
    const csv = toCsvString(["a", "b"], [["1", "2"]]);
    expect(csv).toBe("a,b\r\n1,2");
  });

  it("escapes cells within rows", () => {
    const csv = toCsvString(["name"], [["Smith, John"]]);
    expect(csv).toBe('name\r\n"Smith, John"');
  });
});
