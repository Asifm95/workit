import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findSetupScript,
  runSetupScripts,
} from "../../../src/setup/runner";

describe("findSetupScript", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "workit-setup-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("finds ./setup.sh when present", async () => {
    await writeFile(join(dir, "setup.sh"), "#!/bin/bash\necho hi\n");
    await chmod(join(dir, "setup.sh"), 0o755);
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBe(join(dir, "setup.sh"));
  });

  test("finds .workit/setup.sh when ./setup.sh is missing", async () => {
    await mkdir(join(dir, ".workit"));
    await writeFile(join(dir, ".workit", "setup.sh"), "#!/bin/bash\n");
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBe(join(dir, ".workit/setup.sh"));
  });

  test("returns null when no script is present", async () => {
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBeNull();
  });
});

describe("runSetupScripts", () => {
  let a: string, b: string;
  beforeEach(async () => {
    a = await mkdtemp(join(tmpdir(), "workit-setup-a-"));
    b = await mkdtemp(join(tmpdir(), "workit-setup-b-"));
    await writeFile(join(a, "setup.sh"), "#!/bin/bash\necho A-ok\n");
    await chmod(join(a, "setup.sh"), 0o755);
  });
  afterEach(async () => {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  test("runs scripts in parallel and reports missing ones", async () => {
    const logs: string[] = [];
    const results = await runSetupScripts({
      targets: [
        { name: "A", cwd: a },
        { name: "B", cwd: b },
      ],
      scriptPaths: ["./setup.sh", ".workit/setup.sh"],
      onLine: (name, line) => logs.push(`[${name}] ${line}`),
    });
    expect(results.find((r) => r.name === "A")?.status).toBe("ok");
    expect(results.find((r) => r.name === "B")?.status).toBe("missing");
    expect(logs.some((l) => l.includes("A-ok"))).toBe(true);
  });
});
