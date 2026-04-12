import { describe, expect, test } from "bun:test";
import { prefixLine } from "../../../src/ui/log";

describe("prefixLine", () => {
  test("pads prefix to fixed width and separates with a space", () => {
    expect(prefixLine("A", "hello", 5)).toBe("[A]   hello");
  });
  test("longer prefixes are not truncated", () => {
    expect(prefixLine("long-name", "x", 3)).toBe("[long-name] x");
  });
});
