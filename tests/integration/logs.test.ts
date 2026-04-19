import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runLogsCommand } from '../../src/commands/logs';
import { logsDirFor } from '../../src/setup/runner';

const SLUG_PREFIX = 'workit-int-logs';
let counter = 0;
function uniqueSlug(): string {
  return `${SLUG_PREFIX}-${process.pid}-${Date.now()}-${counter++}`;
}

interface Captured {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function capture(): Captured {
  const origLog = console.log;
  const origErr = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };
  return {
    stdout,
    stderr,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('runLogsCommand', () => {
  const slugs = new Set<string>();

  beforeEach(() => {
    slugs.clear();
  });
  afterEach(async () => {
    for (const slug of slugs) {
      await rm(logsDirFor(slug), { recursive: true, force: true });
    }
  });

  test('single completed project: backfills + prints ✓ ok + exit 0', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'alpha.log'), 'hello\nworld\n');
    await Bun.write(join(dir, 'alpha.status'), '0\n');

    const cap = capture();
    try {
      const result = await runLogsCommand({ slug, project: 'alpha', lines: 10 });
      expect(result.exitCode).toBe(0);
      expect(cap.stdout).toContain('hello');
      expect(cap.stdout).toContain('world');
      expect(cap.stdout.some((l) => stripAnsi(l).includes('✓ alpha ok'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('two completed projects: prefixed backfills + both status lines + exit 0', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'alpha.log'), 'alpha-line\n');
    await Bun.write(join(dir, 'alpha.status'), '0\n');
    await Bun.write(join(dir, 'beta.log'), 'beta-line\n');
    await Bun.write(join(dir, 'beta.status'), '0\n');

    const cap = capture();
    try {
      const result = await runLogsCommand({ slug, lines: 10 });
      expect(result.exitCode).toBe(0);
      const plain = cap.stdout.map(stripAnsi);
      expect(plain.some((l) => l.includes('[alpha]') && l.includes('alpha-line'))).toBe(true);
      expect(plain.some((l) => l.includes('[beta]') && l.includes('beta-line'))).toBe(true);
      expect(plain.some((l) => l.includes('✓ alpha ok'))).toBe(true);
      expect(plain.some((l) => l.includes('✓ beta ok'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('follows a running project to completion', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    const logPath = join(dir, 'alpha.log');
    const statusPath = join(dir, 'alpha.status');
    await Bun.write(logPath, 'boot\n');

    const cap = capture();
    try {
      const runPromise = runLogsCommand({ slug, project: 'alpha', lines: 10 });
      await new Promise((r) => setTimeout(r, 120));
      await Bun.write(logPath, 'boot\nlive-1\n');
      await new Promise((r) => setTimeout(r, 300));
      await Bun.write(logPath, 'boot\nlive-1\nlive-2\n');
      await new Promise((r) => setTimeout(r, 300));
      await Bun.write(statusPath, '0\n');

      const result = await runPromise;
      expect(result.exitCode).toBe(0);
      expect(cap.stdout).toContain('boot');
      expect(cap.stdout).toContain('live-1');
      expect(cap.stdout).toContain('live-2');
    } finally {
      cap.restore();
    }
  });

  test('failed script: exit code matches, ✗ failed printed', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'alpha.log'), 'crashing\n');
    await Bun.write(join(dir, 'alpha.status'), '7\n');

    const cap = capture();
    try {
      const result = await runLogsCommand({ slug, project: 'alpha', lines: 10 });
      expect(result.exitCode).toBe(7);
      expect(cap.stderr.some((l) => stripAnsi(l).includes('✗ alpha failed (exit 7)'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('unknown slug: exit 1 with error', async () => {
    const cap = capture();
    try {
      const result = await runLogsCommand({ slug: uniqueSlug(), lines: 10 });
      expect(result.exitCode).toBe(1);
      expect(cap.stderr.some((l) => stripAnsi(l).includes('no logs for'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('unknown project under valid slug: exit 1 with error', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'alpha.log'), 'hi\n');
    await Bun.write(join(dir, 'alpha.status'), '0\n');

    const cap = capture();
    try {
      const result = await runLogsCommand({ slug, project: 'ghost', lines: 10 });
      expect(result.exitCode).toBe(1);
      expect(cap.stderr.some((l) => stripAnsi(l).includes('no log for "ghost"'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('-n 0 skips backfill, still prints status line', async () => {
    const slug = uniqueSlug();
    slugs.add(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'alpha.log'), 'would-be-backfilled\n');
    await Bun.write(join(dir, 'alpha.status'), '0\n');

    const cap = capture();
    try {
      const result = await runLogsCommand({ slug, project: 'alpha', lines: 0 });
      expect(result.exitCode).toBe(0);
      expect(cap.stdout.includes('would-be-backfilled')).toBe(false);
      expect(cap.stdout.some((l) => stripAnsi(l).includes('✓ alpha ok'))).toBe(true);
    } finally {
      cap.restore();
    }
  });

  test('path-traversal slug is rejected', async () => {
    const cap = capture();
    try {
      const result = await runLogsCommand({ slug: '../../etc', lines: 10 });
      expect(result.exitCode).toBe(1);
      expect(cap.stderr.some((l) => stripAnsi(l).includes('invalid slug'))).toBe(true);
    } finally {
      cap.restore();
    }
  });
});
