import { readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathExists, readJsonFile, writeJsonFile } from "../utils/fs";

export interface Project {
  name: string;
  path: string;
}

async function listSubdirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name));
  } catch {
    return [];
  }
}

async function isGitDir(path: string): Promise<boolean> {
  return pathExists(join(path, ".git"));
}

export async function discoverProjects(roots: string[]): Promise<Project[]> {
  const results: Project[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    for (const dir of await listSubdirs(root)) {
      if (await isGitDir(dir)) {
        const resolved = resolve(dir);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        results.push({ name: dir.split(sep).pop()!, path: resolved });
      }
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export function findProjectContaining(
  projects: Project[],
  cwd: string
): Project | undefined {
  const resolved = resolve(cwd);
  return projects.find(
    (p) => resolved === p.path || resolved.startsWith(p.path + sep)
  );
}

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheFile {
  version: 1;
  refreshedAt: string;
  projects: Project[];
}

export async function loadProjectsCached(
  cachePath: string,
  roots: string[],
  forceRefresh: boolean
): Promise<Project[]> {
  if (!forceRefresh && (await pathExists(cachePath))) {
    try {
      const cache = await readJsonFile<CacheFile>(cachePath);
      const age = Date.now() - new Date(cache.refreshedAt).getTime();
      if (cache.version === 1 && age < CACHE_TTL_MS) {
        return cache.projects;
      }
    } catch {
      // fall through to refresh
    }
  }
  const projects = await discoverProjects(roots);
  const cache: CacheFile = {
    version: 1,
    refreshedAt: new Date().toISOString(),
    projects,
  };
  await writeJsonFile(cachePath, cache);
  return projects;
}
