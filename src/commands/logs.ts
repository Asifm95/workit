import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { logsDirFor } from '../setup/runner';
import { pathExists } from '../utils/fs';
import { colorFor, error, prefixLine, success } from '../ui/log';

export interface RunLogsArgs {
  slug: string;
  project?: string;
  lines: number;
}

export interface RunLogsResult {
  exitCode: number;
}

export interface LogEntry {
  project: string;
  logPath: string;
  statusPath: string;
}

const POLL_MS = 200;

function logsRoot(): string {
  return join(homedir(), '.workit', 'logs');
}

function isInsideLogsRoot(dir: string): boolean {
  const resolved = resolve(dir);
  const root = resolve(logsRoot());
  return resolved === root || resolved.startsWith(root + sep);
}

export async function listProjects(slug: string): Promise<LogEntry[]> {
  const dir = logsDirFor(slug);
  if (!isInsideLogsRoot(dir)) return [];
  if (!(await pathExists(dir))) return [];
  const names = await readdir(dir);
  return names
    .filter((n) => n.endsWith('.log'))
    .map((n) => {
      const project = n.slice(0, -'.log'.length);
      return {
        project,
        logPath: join(dir, `${project}.log`),
        statusPath: join(dir, `${project}.status`),
      };
    })
    .sort((a, b) => a.project.localeCompare(b.project));
}

export async function readExitCode(statusPath: string): Promise<number | null> {
  if (!(await pathExists(statusPath))) return null;
  const raw = (await Bun.file(statusPath).text()).trim();
  if (raw.length === 0) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function tail(
  entry: LogEntry,
  lines: number,
  emit: (line: string) => void,
  pollMs: number = POLL_MS,
): Promise<void> {
  let partial = '';

  if (lines > 0 && (await pathExists(entry.logPath))) {
    const text = await Bun.file(entry.logPath).text();
    const all = text.split('\n');
    if (all.length > 0 && all[all.length - 1] === '') all.pop();
    for (const line of all.slice(-lines)) emit(line);
  }

  let offset = (await pathExists(entry.logPath))
    ? (await Bun.file(entry.logPath).stat()).size
    : 0;

  while (true) {
    if (await pathExists(entry.logPath)) {
      const size = (await Bun.file(entry.logPath).stat()).size;
      if (size < offset) offset = 0;
      if (size > offset) {
        const chunk = await Bun.file(entry.logPath).slice(offset, size).text();
        const combined = partial + chunk;
        const parts = combined.split('\n');
        partial = parts.pop() ?? '';
        for (const line of parts) emit(line);
        offset = size;
      }
    }
    const code = await readExitCode(entry.statusPath);
    if (code !== null) {
      if (partial) {
        emit(partial);
        partial = '';
      }
      return;
    }
    await Bun.sleep(pollMs);
  }
}

export async function runLogsCommand(args: RunLogsArgs): Promise<RunLogsResult> {
  if (!isInsideLogsRoot(logsDirFor(args.slug))) {
    error(`invalid slug "${args.slug}"`);
    return { exitCode: 1 };
  }

  const projects = await listProjects(args.slug);
  if (projects.length === 0) {
    error(`no logs for "${args.slug}"`);
    return { exitCode: 1 };
  }

  let targets = projects;
  if (args.project) {
    const only = projects.find((p) => p.project === args.project);
    if (!only) {
      error(`no log for "${args.project}" under "${args.slug}"`);
      return { exitCode: 1 };
    }
    targets = [only];
  }

  const multi = targets.length > 1;
  const width = multi ? Math.max(...targets.map((t) => t.project.length + 2)) : 0;

  await Promise.all(
    targets.map((t) =>
      tail(t, args.lines, (line) => {
        if (!multi) console.log(line);
        else console.log(colorFor(t.project)(prefixLine(t.project, line, width)));
      }),
    ),
  );

  let anyFailed = false;
  let singleExit = 0;
  for (const t of targets) {
    const code = (await readExitCode(t.statusPath)) ?? 0;
    if (code === 0) {
      success(`${t.project} ok`);
    } else {
      error(`${t.project} failed (exit ${code})`);
      anyFailed = true;
      singleExit = code;
    }
  }

  if (!multi) return { exitCode: singleExit };
  return { exitCode: anyFailed ? 1 : 0 };
}
