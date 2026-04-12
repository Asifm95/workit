import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import {
  discoverProjects,
  findProjectContaining,
} from "../../../src/core/project-discovery";

async function initRepo(path: string) {
  await execa("git", ["init", "-q", path]);
}

describe("discoverProjects", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-disc-"));
    await mkdir(join(root, "r1"));
    await mkdir(join(root, "r2"));
    await mkdir(join(root, "not-a-repo"));
    await initRepo(join(root, "r1"));
    await initRepo(join(root, "r2"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("finds repos one level under a root", async () => {
    const projects = await discoverProjects([root]);
    const names = projects.map((p) => p.name).sort();
    expect(names).toEqual(["r1", "r2"]);
  });

  test("skips directories without .git", async () => {
    const projects = await discoverProjects([root]);
    expect(projects.find((p) => p.name === "not-a-repo")).toBeUndefined();
  });

  test("handles missing root directories gracefully", async () => {
    const projects = await discoverProjects([
      root,
      join(root, "does-not-exist"),
    ]);
    expect(projects.length).toBe(2);
  });
});

describe("findProjectContaining", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-disc-"));
    await mkdir(join(root, "r1"));
    await initRepo(join(root, "r1"));
    await mkdir(join(root, "r1", "sub"));
    await writeFile(join(root, "r1", "sub", "file.txt"), "x");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns the project when cwd is inside it", async () => {
    const projects = await discoverProjects([root]);
    const hit = findProjectContaining(projects, join(root, "r1", "sub"));
    expect(hit?.name).toBe("r1");
  });

  test("returns undefined when cwd is not under any project", async () => {
    const projects = await discoverProjects([root]);
    const hit = findProjectContaining(projects, "/tmp");
    expect(hit).toBeUndefined();
  });
});
