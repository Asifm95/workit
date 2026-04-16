import { execa } from 'execa';
import { join } from 'node:path';
import { pathExists } from '../utils/fs';

export async function findSetupScript(cwd: string, candidates: string[]): Promise<string | null> {
  for (const rel of candidates) {
    const normalized = rel.startsWith('./') ? rel.slice(2) : rel;
    const full = join(cwd, normalized);
    if (await pathExists(full)) return full;
  }
  return null;
}

export interface SetupTarget {
  name: string;
  cwd: string;
}

export type SetupStatus = 'ok' | 'missing' | 'failed';
export interface SetupResult {
  name: string;
  status: SetupStatus;
  scriptPath: string | null;
  exitCode: number | null;
  error?: string;
}

export interface RunSetupOptions {
  targets: SetupTarget[];
  scriptPaths: string[];
  onLine: (name: string, line: string) => void;
}

async function runOne(
  target: SetupTarget,
  scriptPaths: string[],
  onLine: (name: string, line: string) => void,
): Promise<SetupResult> {
  const script = await findSetupScript(target.cwd, scriptPaths);
  if (!script) {
    return { name: target.name, status: 'missing', scriptPath: null, exitCode: null };
  }
  try {
    const child = execa('bash', [script], { cwd: target.cwd, all: true }) as any;
    child.all?.on('data', (chunk: Buffer) => {
      chunk
        .toString('utf8')
        .split('\n')
        .forEach((line: string) => {
          if (line.length > 0) onLine(target.name, line);
        });
    });
    const result = await child;
    return {
      name: target.name,
      status: 'ok',
      scriptPath: script,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: any) {
    return {
      name: target.name,
      status: 'failed',
      scriptPath: script,
      exitCode: err.exitCode ?? null,
      error: err.shortMessage ?? String(err),
    };
  }
}

export async function runSetupScripts(options: RunSetupOptions): Promise<SetupResult[]> {
  return Promise.all(options.targets.map((t) => runOne(t, options.scriptPaths, options.onLine)));
}
