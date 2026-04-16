import { describe, expect, test } from "bun:test";
import { computeShellDefault } from "../../../src/ui/prompts";

describe("computeShellDefault", () => {
  test("insideCmux + cmux available → cmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: true,
        tmuxAvailable: true,
        insideCmux: true,
        insideTmux: false,
      }),
    ).toBe("cmux");
  });

  test("insideTmux (not cmux) + tmux available → tmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: true,
        tmuxAvailable: true,
        insideCmux: false,
        insideTmux: true,
      }),
    ).toBe("tmux");
  });

  test("not inside either + both available → tmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: true,
        tmuxAvailable: true,
        insideCmux: false,
        insideTmux: false,
      }),
    ).toBe("tmux");
  });

  test("only cmux available → cmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: true,
        tmuxAvailable: false,
        insideCmux: false,
        insideTmux: false,
      }),
    ).toBe("cmux");
  });

  test("only tmux available → tmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: false,
        tmuxAvailable: true,
        insideCmux: false,
        insideTmux: false,
      }),
    ).toBe("tmux");
  });

  test("insideCmux but cmux not available → falls back to tmux", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: false,
        tmuxAvailable: true,
        insideCmux: true,
        insideTmux: false,
      }),
    ).toBe("tmux");
  });

  test("neither available → none", () => {
    expect(
      computeShellDefault({
        cmuxAvailable: false,
        tmuxAvailable: false,
        insideCmux: false,
        insideTmux: false,
      }),
    ).toBe("none");
  });
});
