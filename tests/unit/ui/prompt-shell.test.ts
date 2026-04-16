import { describe, expect, test } from "bun:test";
import { computeShellDefault } from "../../../src/ui/prompts";

const base = {
  cmuxAvailable: false,
  tmuxAvailable: false,
  warpAvailable: false,
  insideCmux: false,
  insideTmux: false,
  insideWarp: false,
};

describe("computeShellDefault", () => {
  test("insideCmux + cmux available → cmux", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
        tmuxAvailable: true,
        insideCmux: true,
      }),
    ).toBe("cmux");
  });

  test("insideTmux (not cmux) + tmux available → tmux", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
        tmuxAvailable: true,
        insideTmux: true,
      }),
    ).toBe("tmux");
  });

  test("insideWarp + warp available → warp", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
        tmuxAvailable: true,
        warpAvailable: true,
        insideWarp: true,
      }),
    ).toBe("warp");
  });

  test("insideWarp but only tmux/cmux available → tmux (warp not in fallback)", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
        tmuxAvailable: true,
        warpAvailable: false,
        insideWarp: true,
      }),
    ).toBe("tmux");
  });

  test("not inside any + both available → tmux", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
        tmuxAvailable: true,
      }),
    ).toBe("tmux");
  });

  test("only cmux available → cmux", () => {
    expect(
      computeShellDefault({
        ...base,
        cmuxAvailable: true,
      }),
    ).toBe("cmux");
  });

  test("only tmux available → tmux", () => {
    expect(
      computeShellDefault({
        ...base,
        tmuxAvailable: true,
      }),
    ).toBe("tmux");
  });

  test("only warp available (not inside) → none (warp absent from fallback)", () => {
    expect(
      computeShellDefault({
        ...base,
        warpAvailable: true,
      }),
    ).toBe("none");
  });

  test("insideCmux but cmux not available → falls back to tmux", () => {
    expect(
      computeShellDefault({
        ...base,
        tmuxAvailable: true,
        insideCmux: true,
      }),
    ).toBe("tmux");
  });

  test("nothing available → none", () => {
    expect(computeShellDefault({ ...base })).toBe("none");
  });
});
