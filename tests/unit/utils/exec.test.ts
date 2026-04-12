import { describe, expect, test } from "bun:test";
import { run, runCapture } from "../../../src/utils/exec";

describe("runCapture", () => {
  test("returns stdout for successful command", async () => {
    const out = await runCapture("echo", ["hello"]);
    expect(out.stdout.trim()).toBe("hello");
    expect(out.exitCode).toBe(0);
  });

  test("throws on non-zero exit", async () => {
    await expect(runCapture("false", [])).rejects.toThrow();
  });

  test("passes cwd through", async () => {
    const out = await runCapture("pwd", [], { cwd: "/tmp" });
    expect(out.stdout.trim()).toMatch(/\/tmp$/);
  });
});

describe("run", () => {
  test("returns result without throwing on non-zero exit", async () => {
    const out = await run("false", [], { reject: false });
    expect(out.exitCode).not.toBe(0);
  });
});
