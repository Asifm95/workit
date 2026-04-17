import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSetupScript, logsDirFor, runSetupScripts } from '../../../src/setup/runner';
import { pathExists } from '../../../src/utils/fs';

describe('findSetupScript', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'workit-setup-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('finds ./setup.sh when present', async () => {
    await Bun.write(join(dir, 'setup.sh'), '#!/bin/bash\necho hi\n');
    await chmod(join(dir, 'setup.sh'), 0o755);
    const found = await findSetupScript(dir, ['./setup.sh', '.workit/setup.sh']);
    expect(found).toBe(join(dir, 'setup.sh'));
  });

  test('finds .workit/setup.sh when ./setup.sh is missing', async () => {
    await mkdir(join(dir, '.workit'));
    await Bun.write(join(dir, '.workit', 'setup.sh'), '#!/bin/bash\n');
    const found = await findSetupScript(dir, ['./setup.sh', '.workit/setup.sh']);
    expect(found).toBe(join(dir, '.workit/setup.sh'));
  });

  test('returns null when no script is present', async () => {
    const found = await findSetupScript(dir, ['./setup.sh', '.workit/setup.sh']);
    expect(found).toBeNull();
  });
});

async function waitForFile(path: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pathExists(path)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for ${path}`);
}

describe('runSetupScripts (sync mode)', () => {
  let a: string, b: string;
  beforeEach(async () => {
    a = await mkdtemp(join(tmpdir(), 'workit-setup-a-'));
    b = await mkdtemp(join(tmpdir(), 'workit-setup-b-'));
    await Bun.write(join(a, 'setup.sh'), '#!/bin/bash\necho A-ok\n');
    await chmod(join(a, 'setup.sh'), 0o755);
  });
  afterEach(async () => {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  test('runs scripts serially in sync mode and reports missing ones', async () => {
    const logs: string[] = [];
    const results = await runSetupScripts({
      targets: [
        { name: 'A', cwd: a },
        { name: 'B', cwd: b },
      ],
      scriptPaths: ['./setup.sh', '.workit/setup.sh'],
      featureSlug: 'sync-test',
      mode: 'sync',
      onLine: (name, line) => logs.push(`[${name}] ${line}`),
    });
    expect(results.find((r) => r.name === 'A')?.status).toBe('ok');
    expect(results.find((r) => r.name === 'B')?.status).toBe('missing');
    expect(logs.some((l) => l.includes('A-ok'))).toBe(true);
  });

  test('sync mode reports failed on non-zero exit', async () => {
    await Bun.write(join(a, 'setup.sh'), '#!/bin/bash\nexit 7\n');
    await chmod(join(a, 'setup.sh'), 0o755);
    const results = await runSetupScripts({
      targets: [{ name: 'A', cwd: a }],
      scriptPaths: ['./setup.sh'],
      featureSlug: 'sync-fail',
      mode: 'sync',
    });
    expect(results[0]!.status).toBe('failed');
    expect(results[0]!.exitCode).toBe(7);
  });
});

describe('runSetupScripts (async mode)', () => {
  let a: string;
  const slugsCreated: string[] = [];
  beforeEach(async () => {
    a = await mkdtemp(join(tmpdir(), 'workit-setup-async-'));
  });
  afterEach(async () => {
    await rm(a, { recursive: true, force: true });
    for (const slug of slugsCreated) {
      await rm(logsDirFor(slug), { recursive: true, force: true });
    }
    slugsCreated.length = 0;
  });

  test('spawns detached child and writes log + status on success', async () => {
    await Bun.write(join(a, 'setup.sh'), '#!/bin/bash\necho async-ok\n');
    await chmod(join(a, 'setup.sh'), 0o755);
    const slug = `async-ok-${Date.now()}`;
    slugsCreated.push(slug);

    const results = await runSetupScripts({
      targets: [{ name: 'A', cwd: a }],
      scriptPaths: ['./setup.sh'],
      featureSlug: slug,
      mode: 'async',
    });
    expect(results[0]!.status).toBe('spawned');
    expect(results[0]!.pid).toBeGreaterThan(0);
    expect(results[0]!.logPath).toBe(join(logsDirFor(slug), 'A.log'));
    expect(results[0]!.statusPath).toBe(join(logsDirFor(slug), 'A.status'));

    await waitForFile(results[0]!.statusPath!, 5000);
    const statusText = (await Bun.file(results[0]!.statusPath!).text()).trim();
    expect(statusText).toBe('0');
    const logText = await Bun.file(results[0]!.logPath!).text();
    expect(logText).toContain('async-ok');
  });

  test('async mode captures non-zero exit in status file', async () => {
    await Bun.write(join(a, 'setup.sh'), '#!/bin/bash\necho failing\nexit 13\n');
    await chmod(join(a, 'setup.sh'), 0o755);
    const slug = `async-fail-${Date.now()}`;
    slugsCreated.push(slug);

    const results = await runSetupScripts({
      targets: [{ name: 'A', cwd: a }],
      scriptPaths: ['./setup.sh'],
      featureSlug: slug,
      mode: 'async',
    });
    expect(results[0]!.status).toBe('spawned');

    await waitForFile(results[0]!.statusPath!, 5000);
    const statusText = (await Bun.file(results[0]!.statusPath!).text()).trim();
    expect(statusText).toBe('13');
  });

  test('async mode reports missing when no script is present', async () => {
    const slug = `async-missing-${Date.now()}`;
    slugsCreated.push(slug);
    const results = await runSetupScripts({
      targets: [{ name: 'A', cwd: a }],
      scriptPaths: ['./setup.sh'],
      featureSlug: slug,
      mode: 'async',
    });
    expect(results[0]!.status).toBe('missing');
    expect(results[0]!.logPath).toBeNull();
    expect(results[0]!.pid).toBeNull();
  });
});
