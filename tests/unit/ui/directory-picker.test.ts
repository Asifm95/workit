import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listDir,
  findContainingRepo,
  abbreviatePath,
} from "../../../src/ui/directory-picker";

describe("listDir", () => {
  let root: string;
  let cache: Map<string, boolean>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-picker-"));
    cache = new Map();
    // Create a mix of directories
    await mkdir(join(root, "api"));
    await mkdir(join(root, "api", ".git")); // git repo
    await mkdir(join(root, "frontend"));
    await mkdir(join(root, "frontend", ".git")); // git repo
    await mkdir(join(root, "shared-libs")); // plain dir
    await mkdir(join(root, "node_modules")); // should be excluded
    await mkdir(join(root, ".hidden")); // should be excluded (dotfile)
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("lists directories with git repo detection", async () => {
    const entries = await listDir(root, cache);
    const names = entries.map((e) => e.name);
    expect(names).toEqual(["api", "frontend", "shared-libs"]);
    expect(entries.find((e) => e.name === "api")!.isGitRepo).toBe(true);
    expect(entries.find((e) => e.name === "frontend")!.isGitRepo).toBe(true);
    expect(entries.find((e) => e.name === "shared-libs")!.isGitRepo).toBe(false);
  });

  test("excludes node_modules", async () => {
    const entries = await listDir(root, cache);
    expect(entries.find((e) => e.name === "node_modules")).toBeUndefined();
  });

  test("excludes dotfile directories", async () => {
    const entries = await listDir(root, cache);
    expect(entries.find((e) => e.name === ".hidden")).toBeUndefined();
  });

  test("returns sorted entries", async () => {
    const entries = await listDir(root, cache);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
  });

  test("returns empty for non-existent directory", async () => {
    const entries = await listDir(join(root, "does-not-exist"), cache);
    expect(entries).toEqual([]);
  });

  test("caches .git check results", async () => {
    await listDir(root, cache);
    expect(cache.size).toBeGreaterThan(0);
    expect(cache.get(join(root, "api"))).toBe(true);
    expect(cache.get(join(root, "shared-libs"))).toBe(false);
  });
});

describe("findContainingRepo", () => {
  let root: string;
  let cache: Map<string, boolean>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-picker-"));
    cache = new Map();
    await mkdir(join(root, "repo", ".git"), { recursive: true });
    await mkdir(join(root, "repo", "src", "lib"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("finds the repo when cwd is the repo root", async () => {
    const result = await findContainingRepo(join(root, "repo"), cache);
    expect(result).toBe(join(root, "repo"));
  });

  test("finds the repo when cwd is nested inside it", async () => {
    const result = await findContainingRepo(join(root, "repo", "src", "lib"), cache);
    expect(result).toBe(join(root, "repo"));
  });

  test("returns null when not inside any repo", async () => {
    const result = await findContainingRepo(root, cache);
    expect(result).toBeNull();
  });
});

describe("abbreviatePath", () => {
  const home = "/Users/testuser";

  test("abbreviates home directory to ~", () => {
    expect(abbreviatePath("/Users/testuser", home)).toBe("~");
  });

  test("abbreviates paths under home", () => {
    expect(abbreviatePath("/Users/testuser/Projects/app", home)).toBe(
      "~/Projects/app",
    );
  });

  test("does not abbreviate paths outside home", () => {
    expect(abbreviatePath("/var/log", home)).toBe("/var/log");
  });
});
