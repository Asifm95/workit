import { execa } from 'execa';
import { openSync, closeSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/fs';

export type SetupStatus = 'spawned' | 'missing' | 'failed-to-start' | 'ok' | 'failed';

export interface SetupTarget {
  name: string;
  cwd: string;
}

export interface SetupResult {
  name: string;
  status: SetupStatus;
  scriptPath: string | null;
  logPath: string | null;
  statusPath: string | null;
  pid: number | null;
  exitCode: number | null;
  error?: string;
}

export interface RunSetupOptions {
  targets: SetupTarget[];
  scriptPaths: string[];
  featureSlug: string;
  mode: 'async' | 'sync';
  onLine?: (name: string, line: string) => void;
}

export async function findSetupScript(cwd: string, candidates: string[]): Promise<string | null> {
  for (const rel of candidates) {
    const normalized = rel.startsWith('./') ? rel.slice(2) : rel;
    const full = join(cwd, normalized);
    if (await pathExists(full)) return full;
  }
  return null;
}

export function logsDirFor(slug: string): string {
  return join(homedir(), '.workit', 'logs', slug);
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function spawnDetached(
  target: SetupTarget,
  script: string,
  slug: string,
): Promise<SetupResult> {
  const dir = logsDirFor(slug);
  const logPath = join(dir, `${target.name}.log`);
  const statusPath = join(dir, `${target.name}.status`);
  let fd: number | null = null;
  try {
    await mkdir(dir, { recursive: true });
    fd = openSync(logPath, 'w');
    const wrapper = `bash ${shellEscape(script)}; echo $? > ${shellEscape(statusPath)}`;
    const child = (execa as any)('bash', ['-c', wrapper], {
      cwd: target.cwd,
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
      cleanup: false,
    });
    child.unref();
    return {
      name: target.name,
      status: 'spawned',
      scriptPath: script,
      logPath,
      statusPath,
      pid: child.pid ?? null,
      exitCode: null,
    };
  } catch (err) {
    return {
      name: target.name,
      status: 'failed-to-start',
      scriptPath: script,
      logPath: null,
      statusPath: null,
      pid: null,
      exitCode: null,
      error: (err as Error).message,
    };
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }
}

async function runSync(
  target: SetupTarget,
  script: string,
  onLine: ((name: string, line: string) => void) | undefined,
): Promise<SetupResult> {
  try {
    const child = execa('bash', [script], { cwd: target.cwd, all: true }) as any;
    if (onLine) {
      child.all?.on('data', (chunk: Buffer) => {
        chunk
          .toString('utf8')
          .split('\n')
          .forEach((line: string) => {
            if (line.length > 0) onLine(target.name, line);
          });
      });
    }
    const result = await child;
    return {
      name: target.name,
      status: 'ok',
      scriptPath: script,
      logPath: null,
      statusPath: null,
      pid: null,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: any) {
    return {
      name: target.name,
      status: 'failed',
      scriptPath: script,
      logPath: null,
      statusPath: null,
      pid: null,
      exitCode: err.exitCode ?? null,
      error: err.shortMessage ?? String(err),
    };
  }
}

export async function runSetupScripts(options: RunSetupOptions): Promise<SetupResult[]> {
  return Promise.all(
    options.targets.map(async (t) => {
      const script = await findSetupScript(t.cwd, options.scriptPaths);
      if (!script) {
        return {
          name: t.name,
          status: 'missing' as const,
          scriptPath: null,
          logPath: null,
          statusPath: null,
          pid: null,
          exitCode: null,
        };
      }
      return options.mode === 'async'
        ? spawnDetached(t, script, options.featureSlug)
        : runSync(t, script, options.onLine);
    }),
  );
}
