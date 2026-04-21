import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function expandUser(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await Bun.file(p).stat();
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

// True when `<path>/.git` exists as a file (a git worktree pointer).
// A `.git` directory means a regular repo (e.g. user-run `git init`), which
// workit never creates inside `workspacesDir` — so we treat such folders as
// multi-repo workspaces, not single worktrees.
export async function isWorktreePointer(path: string): Promise<boolean> {
  try {
    const s = await stat(join(path, '.git'));
    return s.isFile();
  } catch {
    return false;
  }
}

export async function readJsonFile<T = unknown>(p: string): Promise<T> {
  return (await Bun.file(p).json()) as T;
}

export async function writeJsonFile(p: string, data: unknown): Promise<void> {
  await ensureDir(dirname(p));
  await Bun.write(p, JSON.stringify(data, null, 2) + '\n');
}
