import { describe, expect, test } from "bun:test";
import { selectBackend } from "../../../src/terminal";

describe("selectBackend", () => {
  const base = {
    configDefault: "auto" as const,
    flag: undefined,
    insideTmux: false,
    insideCmux: false,
    insideWarp: false,
    tmuxAvailable: true,
    cmuxAvailable: true,
    warpAvailable: true,
  };

  test("explicit flag wins", () => {
    expect(selectBackend({ ...base, flag: "tmux" })).toBe("tmux");
    expect(selectBackend({ ...base, flag: "none" })).toBe("none");
    expect(selectBackend({ ...base, flag: "warp" })).toBe("warp");
  });

  test("inside cmux prefers cmux", () => {
    expect(selectBackend({ ...base, insideCmux: true })).toBe("cmux");
  });

  test("inside tmux (not cmux) prefers tmux", () => {
    expect(selectBackend({ ...base, insideTmux: true })).toBe("tmux");
  });

  test("inside warp (not tmux or cmux) prefers warp", () => {
    expect(selectBackend({ ...base, insideWarp: true })).toBe("warp");
  });

  test("inside warp but tmux is the current session → tmux wins (tmux precedence over warp)", () => {
    expect(
      selectBackend({ ...base, insideWarp: true, insideTmux: true }),
    ).toBe("tmux");
  });

  test("config default overrides auto-detect when not 'auto'", () => {
    expect(selectBackend({ ...base, configDefault: "tmux" })).toBe("tmux");
  });

  test("configDefault='warp' selects warp when available", () => {
    expect(selectBackend({ ...base, configDefault: "warp" })).toBe("warp");
  });

  test("configDefault='warp' falls through when warp unavailable", () => {
    // No flag, no inside-*; configDefault=warp but warpAvailable=false → fall through to fallback chain
    expect(
      selectBackend({ ...base, configDefault: "warp", warpAvailable: false }),
    ).toBe("tmux");
  });

  test("falls back to first available when configDefault is auto", () => {
    expect(selectBackend({ ...base, tmuxAvailable: false })).toBe("cmux");
    expect(selectBackend({ ...base, cmuxAvailable: false })).toBe("tmux");
  });

  test("warp is absent from availability fallback (only selects via inside/config/flag)", () => {
    // Only warp installed, not inside any session, auto default → should still pick 'none', not 'warp'
    expect(
      selectBackend({
        ...base,
        tmuxAvailable: false,
        cmuxAvailable: false,
        warpAvailable: true,
      }),
    ).toBe("none");
  });

  test("falls back to none when nothing is available", () => {
    expect(
      selectBackend({
        ...base,
        tmuxAvailable: false,
        cmuxAvailable: false,
        warpAvailable: false,
      }),
    ).toBe("none");
  });
});
