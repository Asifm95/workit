import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../core/config';
import { resolveConfigPaths } from '../core/config';
import { isWorktreePointer, pathExists } from '../utils/fs';
import { info } from '../ui/log';

export interface ListEntry {
  kind: 'workspace' | 'single';
  name: string;
  path: string;
}

export async function listEntries(config: Config): Promise<ListEntry[]> {
  const resolved = resolveConfigPaths(config);
  const root = resolved.resolvedWorkspacesDir;
  if (!(await pathExists(root))) return [];
  const children = await readdir(root, { withFileTypes: true });
  const out: ListEntry[] = [];
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const full = join(root, c.name);
    const kind = (await isWorktreePointer(full)) ? 'single' : 'workspace';
    out.push({ kind, name: c.name, path: full });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function runLsCommand(config: Config): Promise<void> {
  const entries = await listEntries(config);
  if (entries.length === 0) {
    info('No worktrees or workspaces found.');
    return;
  }
  for (const e of entries) {
    const tag = e.kind === 'workspace' ? '[workspace]' : '[worktree] ';
    console.log(`${tag} ${e.name}  ${e.path}`);
  }
}
