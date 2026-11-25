import { describe, expect, it } from "vitest";
import { newRevision } from "./channel";

describe("newRevision", () => {
  it("takes an event about a change the screen hasn't seen", () => {
    expect(newRevision({ revision: 8 }, 7)).toBe(8);
    expect(newRevision({ revision: 12 }, 7)).toBe(12);
  });

  it("ignores a duplicate, our own change, or an older event (spec 12.2)", () => {
    expect(newRevision({ revision: 7 }, 7)).toBeNull();
    expect(newRevision({ revision: 6 }, 7)).toBeNull();
  });

  it("ignores an event without a valid revision", () => {
    for (const payload of [null, {}, { revision: "9" }, { revision: -1 }, { revision: 8.5 }]) {
      expect(newRevision(payload, 7)).toBeNull();
    }
  });
});
