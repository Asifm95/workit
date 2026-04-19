import { describe, expect, test, afterEach } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listProjects,
  readExitCode,
  tail,
  type LogEntry,
} from '../../../src/commands/logs';
import { logsDirFor } from '../../../src/setup/runner';

const SLUG_PREFIX = 'workit-unit-logs';
let counter = 0;
function uniqueSlug(): string {
  return `${SLUG_PREFIX}-${process.pid}-${Date.now()}-${counter++}`;
}

describe('listProjects', () => {
  const slugs: string[] = [];
  afterEach(async () => {
    while (slugs.length) {
      await rm(logsDirFor(slugs.pop()!), { recursive: true, force: true });
    }
  });

  test('returns empty when the logs dir does not exist', async () => {
    const slug = uniqueSlug();
    const entries = await listProjects(slug);
    expect(entries).toEqual([]);
  });

  test('lists only *.log files and sorts by project name', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'beta.log'), 'hi\n');
    await Bun.write(join(dir, 'alpha.log'), 'hi\n');
    await Bun.write(join(dir, 'alpha.status'), '0\n');
    await Bun.write(join(dir, 'notes.txt'), 'ignored\n');

    const entries = await listProjects(slug);
    expect(entries.map((e) => e.project)).toEqual(['alpha', 'beta']);
    expect(entries[0]!.logPath).toBe(join(dir, 'alpha.log'));
    expect(entries[0]!.statusPath).toBe(join(dir, 'alpha.status'));
  });

  test('rejects traversal slug (returns empty)', async () => {
    const entries = await listProjects('../../etc');
    expect(entries).toEqual([]);
  });
});

describe('readExitCode', () => {
  const slugs: string[] = [];
  afterEach(async () => {
    while (slugs.length) {
      await rm(logsDirFor(slugs.pop()!), { recursive: true, force: true });
    }
  });

  test('parses integers', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    const p0 = join(dir, 'zero.status');
    const p2 = join(dir, 'two.status');
    await Bun.write(p0, '0\n');
    await Bun.write(p2, '2\n');
    expect(await readExitCode(p0)).toBe(0);
    expect(await readExitCode(p2)).toBe(2);
  });

  test('returns null for missing file', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    expect(await readExitCode(join(dir, 'missing.status'))).toBeNull();
  });

  test('returns null for empty or non-integer file (race with echo $?)', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    await mkdir(dir, { recursive: true });
    const empty = join(dir, 'empty.status');
    const junk = join(dir, 'junk.status');
    await Bun.write(empty, '');
    await Bun.write(junk, 'notanumber');
    expect(await readExitCode(empty)).toBeNull();
    expect(await readExitCode(junk)).toBeNull();
  });
});

async function makeEntry(dir: string, project: string): Promise<LogEntry> {
  await mkdir(dir, { recursive: true });
  return {
    project,
    logPath: join(dir, `${project}.log`),
    statusPath: join(dir, `${project}.status`),
  };
}

describe('tail', () => {
  const slugs: string[] = [];
  afterEach(async () => {
    while (slugs.length) {
      await rm(logsDirFor(slugs.pop()!), { recursive: true, force: true });
    }
  });

  test('lines=0 emits nothing from backfill, then follows to sentinel', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    const entry = await makeEntry(dir, 'alpha');
    await Bun.write(entry.logPath, 'one\ntwo\nthree\n');
    await Bun.write(entry.statusPath, '0\n');

    const emitted: string[] = [];
    await tail(entry, 0, (l) => emitted.push(l), 10);
    expect(emitted).toEqual([]);
  });

  test('backfills last N lines then exits on existing sentinel', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    const entry = await makeEntry(dir, 'alpha');
    await Bun.write(entry.logPath, 'a\nb\nc\nd\ne\n');
    await Bun.write(entry.statusPath, '0\n');

    const emitted: string[] = [];
    await tail(entry, 3, (l) => emitted.push(l), 10);
    expect(emitted).toEqual(['c', 'd', 'e']);
  });

  test('holds a partial line until it is terminated', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    const entry = await makeEntry(dir, 'alpha');
    await Bun.write(entry.logPath, '');

    const emitted: string[] = [];
    const done = tail(entry, 0, (l) => emitted.push(l), 20);

    await new Promise((r) => setTimeout(r, 40));
    await Bun.write(entry.logPath, 'partial');
    await new Promise((r) => setTimeout(r, 60));
    expect(emitted).toEqual([]);

    await Bun.write(entry.logPath, 'partial-complete\nnext');
    await new Promise((r) => setTimeout(r, 60));
    expect(emitted).toEqual(['partial-complete']);

    await Bun.write(entry.statusPath, '0\n');
    await done;
    expect(emitted).toEqual(['partial-complete', 'next']);
  });

  test('resets offset when the file is truncated mid-follow', async () => {
    const slug = uniqueSlug();
    slugs.push(slug);
    const dir = logsDirFor(slug);
    const entry = await makeEntry(dir, 'alpha');
    await Bun.write(entry.logPath, 'a\nb\n');

    const emitted: string[] = [];
    const done = tail(entry, 0, (l) => emitted.push(l), 20);

    await new Promise((r) => setTimeout(r, 40));
    await Bun.write(entry.logPath, 'x\n');
    await new Promise((r) => setTimeout(r, 60));
    expect(emitted).toEqual(['x']);

    await Bun.write(entry.statusPath, '0\n');
    await done;
  });
});
