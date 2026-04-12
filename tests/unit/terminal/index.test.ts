import { describe, expect, test } from "bun:test";
import { selectBackend } from "../../../src/terminal";

describe("selectBackend", () => {
  const base = {
    configDefault: "auto" as const,
    flag: undefined,
    insideTmux: false,
    insideCmux: false,
    tmuxAvailable: true,
    cmuxAvailable: true,
  };

  test("explicit flag wins", () => {
    expect(selectBackend({ ...base, flag: "tmux" })).toBe("tmux");
    expect(selectBackend({ ...base, flag: "none" })).toBe("none");
  });

  test("inside cmux prefers cmux", () => {
    expect(selectBackend({ ...base, insideCmux: true })).toBe("cmux");
  });

  test("inside tmux (not cmux) prefers tmux", () => {
    expect(selectBackend({ ...base, insideTmux: true })).toBe("tmux");
  });

  test("config default overrides auto-detect when not 'auto'", () => {
    expect(selectBackend({ ...base, configDefault: "tmux" })).toBe("tmux");
  });

  test("falls back to first available when configDefault is auto", () => {
    expect(selectBackend({ ...base, tmuxAvailable: false })).toBe("cmux");
    expect(selectBackend({ ...base, cmuxAvailable: false })).toBe("tmux");
  });

  test("falls back to none when nothing is available", () => {
    expect(
      selectBackend({ ...base, tmuxAvailable: false, cmuxAvailable: false })
    ).toBe("none");
  });
});
