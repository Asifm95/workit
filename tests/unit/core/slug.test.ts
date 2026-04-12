import { describe, expect, test } from "bun:test";
import { slugify } from "../../../src/core/slug";

describe("slugify", () => {
  test("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Add DAC7 Reporting")).toBe("add-dac7-reporting");
  });

  test("strips punctuation", () => {
    expect(slugify("Fix bug: user's profile!")).toBe("fix-bug-users-profile");
  });

  test("collapses multiple separators", () => {
    expect(slugify("foo  --  bar")).toBe("foo-bar");
  });

  test("trims leading/trailing hyphens", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  test("throws on empty input", () => {
    expect(() => slugify("")).toThrow("empty");
    expect(() => slugify("   ")).toThrow("empty");
  });

  test("throws on input that slugifies to empty", () => {
    expect(() => slugify("!!!")).toThrow("empty");
  });

  test("preserves numbers", () => {
    expect(slugify("SL-560 custom fields")).toBe("sl-560-custom-fields");
  });
});
