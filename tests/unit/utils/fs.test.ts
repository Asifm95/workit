import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandUser,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from "../../../src/utils/fs";

describe("expandUser", () => {
  test("replaces leading ~ with home directory", () => {
    const home = process.env.HOME!;
    expect(expandUser("~/foo/bar")).toBe(join(home, "foo/bar"));
  });
  test("leaves paths without leading ~ alone", () => {
    expect(expandUser("/abs/path")).toBe("/abs/path");
    expect(expandUser("relative")).toBe("relative");
  });
  test("does not replace ~ in the middle", () => {
    expect(expandUser("/foo/~bar")).toBe("/foo/~bar");
  });
});

describe("pathExists / ensureDir", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-fs-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("pathExists returns false for missing path", async () => {
    expect(await pathExists(join(tmp, "nope"))).toBe(false);
  });
  test("pathExists returns true after writing a file", async () => {
    const p = join(tmp, "f.txt");
    await Bun.write(p, "hi");
    expect(await pathExists(p)).toBe(true);
  });
  test("ensureDir creates nested directories", async () => {
    const p = join(tmp, "a/b/c");
    await ensureDir(p);
    expect(await pathExists(p)).toBe(true);
  });
});

describe("readJsonFile / writeJsonFile", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-json-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("writes and reads a JSON object", async () => {
    const p = join(tmp, "data.json");
    await writeJsonFile(p, { a: 1, b: ["x"] });
    const raw = await Bun.file(p).text();
    expect(JSON.parse(raw)).toEqual({ a: 1, b: ["x"] });
    expect(await readJsonFile<{ a: number; b: string[] }>(p)).toEqual({ a: 1, b: ["x"] });
  });

  test("writeJsonFile creates parent dirs", async () => {
    const p = join(tmp, "nested/dir/data.json");
    await writeJsonFile(p, { ok: true });
    expect(await pathExists(p)).toBe(true);
  });
});
