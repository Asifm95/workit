import { mkdir } from 'node:fs/promises';
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

export async function readJsonFile<T = unknown>(p: string): Promise<T> {
  return (await Bun.file(p).json()) as T;
}

export async function writeJsonFile(p: string, data: unknown): Promise<void> {
  await ensureDir(dirname(p));
  await Bun.write(p, JSON.stringify(data, null, 2) + '\n');
}
