import { describe, expect, it } from "vitest";
import { cleanName, normalizeName } from "./names";

describe("cleanName", () => {
  it("trims and collapses runs of spaces", () => {
    expect(cleanName("  גבינה   צהובה  ")).toBe("גבינה צהובה");
  });

  it("treats tabs, newlines and non-breaking spaces as spaces", () => {
    expect(cleanName("חלב\t3%\n תנובה")).toBe("חלב 3% תנובה");
  });

  it("keeps the case", () => {
    expect(cleanName(" Coca Cola ")).toBe("Coca Cola");
  });

  it("normalizes Unicode to NFC", () => {
    // "é" written as e + combining accent, and as one character.
    expect(cleanName("café")).toBe("café");
  });

  it("returns an empty string for a blank name", () => {
    expect(cleanName(" \t ")).toBe("");
  });
});

describe("normalizeName", () => {
  it("matches names that differ only in spaces or English case", () => {
    expect(normalizeName("Coca  Cola ")).toBe(normalizeName("coca cola"));
    expect(normalizeName(" במבה ")).toBe(normalizeName("במבה"));
  });

  it("keeps different names different", () => {
    expect(normalizeName("חלב")).not.toBe(normalizeName("חלב סויה"));
  });

  it("lower-cases mixed Hebrew and English", () => {
    expect(normalizeName("קפה NESCAFE")).toBe("קפה nescafe");
  });
});
