import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import * as readline from 'node:readline';
import pc from 'picocolors';
import type { Project } from '../core/project-discovery';
import { pathExists } from '../utils/fs';

export interface DirEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

const EXCLUDED = new Set(['node_modules', '.git']);

const S_BAR = '│';
const S_BAR_END = '└';
const S_STEP_ACTIVE = '◆';
const S_STEP_SUBMIT = '◇';

export function abbreviatePath(p: string, home: string): string {
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
  return p;
}

export function resolveCursor(entries: DirEntry[], cameFromName: string | null): number {
  if (!cameFromName) return 0;
  const idx = entries.findIndex((e) => e.name === cameFromName);
  return idx >= 0 ? idx : 0;
}

async function checkGit(path: string, cache: Map<string, boolean>): Promise<boolean> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const result = await pathExists(join(path, '.git'));
  cache.set(path, result);
  return result;
}

export async function listDir(dir: string, cache: Map<string, boolean>): Promise<DirEntry[]> {
  try {
    const raw = await readdir(dir, { withFileTypes: true });
    const dirs = raw
      .filter((e) => e.isDirectory() && !EXCLUDED.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const entries: DirEntry[] = [];
    for (const d of dirs) {
      const full = join(dir, d.name);
      entries.push({
        name: d.name,
        path: full,
        isGitRepo: await checkGit(full, cache),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function findContainingRepo(
  startPath: string,
  cache: Map<string, boolean>,
): Promise<string | null> {
  let current = resolve(startPath);
  while (true) {
    if (await checkGit(current, cache)) return current;
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  return null;
}

export async function directoryPicker(opts: { cwd: string }): Promise<Project[]> {
  const home = homedir();
  const gitCache = new Map<string, boolean>();
  const selected = new Set<string>();
  let cwd = resolve(opts.cwd);
  let entries: DirEntry[] = [];
  let filtered: DirEntry[] = [];
  let search = '';
  let cursor = 0;
  let prevLineCount = 0;
  let busy = false;

  let cameFromBasename: string | null = null;
  const containingRepo = await findContainingRepo(cwd, gitCache);
  if (containingRepo) {
    selected.add(containingRepo);
    // Start one level up so the repo itself is visible and selected in the list
    const parent = dirname(containingRepo);
    if (parent !== containingRepo) {
      cameFromBasename = basename(containingRepo);
      cwd = parent;
    }
  }

  entries = await listDir(cwd, gitCache);
  filtered = entries;
  cursor = resolveCursor(filtered, cameFromBasename);

  return new Promise<Project[]>((resolvePromise) => {
    const { stdin, stdout } = process;

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdout.write('\x1B[?25l'); // hide cursor

    function clearPrev() {
      if (prevLineCount <= 0) return;
      // lines.join('\n') leaves the cursor on the LAST line of content, not
      // below it, so we move up by prevLineCount - 1 to return to the first row.
      const up = prevLineCount - 1;
      const moveUp = up > 0 ? `\x1B[${up}A` : '';
      stdout.write(`${moveUp}\x1B[G\x1B[J`);
    }

    function render() {
      clearPrev();

      const lines: string[] = [];
      const selCount = selected.size;
      const cwdDisplay = abbreviatePath(cwd, home);
      const bar = pc.cyan(S_BAR);
      const body = (text: string) => `${bar}  ${text}`;

      lines.push(pc.gray(S_BAR));
      lines.push(
        `${pc.cyan(S_STEP_ACTIVE)}  ${pc.bold('Select git repos')}${pc.dim('  Tab toggle · Enter confirm')}`,
      );
      lines.push(
        body(
          pc.cyan(cwdDisplay) +
            (selCount > 0 ? `  ${pc.green(String(selCount) + ' selected')}` : ''),
        ),
      );
      lines.push(bar);

      // Search input
      if (search) {
        lines.push(body(`${pc.yellow('/')} ${search}${pc.dim('▌')}`));
      } else {
        lines.push(body(pc.dim('/ type to filter...')));
      }
      lines.push(bar);

      // Parent directory entry
      const parentCursor = cursor === -1;
      const parentPtr = parentCursor ? pc.cyan('❯') : ' ';
      lines.push(body(`${parentPtr} ${pc.dim('..')}  ${pc.dim('(parent)')}`));

      // Directory entries
      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i]!;
        const isCursor = i === cursor;
        const ptr = isCursor ? pc.cyan('❯') : ' ';

        if (entry.isGitRepo) {
          const isSel = selected.has(entry.path);
          const check = isSel ? pc.green('[x]') : pc.dim('[ ]');
          const name = isCursor ? pc.bold(pc.white(entry.name + '/')) : entry.name + '/';
          lines.push(body(`${ptr} ${name}  ${check} ${pc.dim('git')}`));
        } else {
          const name = pc.dim(entry.name + '/');
          lines.push(body(`${ptr} ${name}  ${pc.dim('dir')}`));
        }
      }

      if (filtered.length === 0) {
        lines.push(body(pc.dim('  (no matching directories)')));
      }

      lines.push(bar);
      lines.push(
        body(pc.dim('↑↓ navigate · →/ forward  · ←/ backward · Tab select · Enter confirm')),
      );
      lines.push(pc.cyan(S_BAR_END));

      stdout.write(lines.join('\n'));
      prevLineCount = lines.length;
    }

    function applyFilter() {
      const term = search.toLowerCase();
      filtered = term ? entries.filter((e) => e.name.toLowerCase().includes(term)) : entries;
      cursor = Math.min(cursor, Math.max(0, filtered.length - 1));
    }

    async function navigateInto(path: string) {
      cwd = path;
      search = '';
      entries = await listDir(cwd, gitCache);
      filtered = entries;
      cursor = 0;
    }

    async function navigateToParent() {
      const parent = dirname(cwd);
      if (parent === cwd) return;
      const cameFrom = basename(cwd);
      cwd = parent;
      search = '';
      entries = await listDir(cwd, gitCache);
      filtered = entries;
      cursor = resolveCursor(filtered, cameFrom);
    }

    function renderSubmit() {
      clearPrev();
      const bar = pc.gray(S_BAR);
      const summary = Array.from(selected)
        .map((p) => abbreviatePath(p, home))
        .join(pc.dim(', '));
      const lines = [
        bar,
        `${pc.green(S_STEP_SUBMIT)}  ${pc.bold('Select git repos')}`,
        `${bar}  ${pc.dim(summary)}`,
      ];
      stdout.write(lines.join('\n'));
      prevLineCount = lines.length;
    }

    function cleanup() {
      stdin.removeListener('keypress', handleKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\x1B[?25h\n'); // show cursor
    }

    async function handleKey(str: string | undefined, key: readline.Key) {
      if (busy) return;
      busy = true;
      try {
        // Ctrl+C / Escape — cancel
        if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
          cleanup();
          process.exit(0);
        }

        // Enter — confirm if selections exist, otherwise enter dir
        if (key.name === 'return') {
          if (selected.size > 0) {
            renderSubmit();
            cleanup();
            resolvePromise(
              Array.from(selected).map((p) => ({
                name: basename(p),
                path: p,
              })),
            );
            return;
          }
          // No selections — treat as "enter directory" if cursor is on a dir
          const entry = filtered[cursor];
          if (entry) {
            await navigateInto(entry.path);
            render();
          }
          return;
        }

        // Tab — toggle selection on git repos
        if (key.name === 'tab') {
          const entry = filtered[cursor];
          if (entry?.isGitRepo) {
            if (selected.has(entry.path)) {
              selected.delete(entry.path);
            } else {
              selected.add(entry.path);
            }
          }
          render();
          return;
        }

        // Up
        if (key.name === 'up') {
          cursor = Math.max(0, cursor - 1);
          render();
          return;
        }

        // Down
        if (key.name === 'down') {
          cursor = Math.min(filtered.length - 1, cursor + 1);
          render();
          return;
        }

        // Right — enter directory
        if (key.name === 'right') {
          const entry = filtered[cursor];
          if (entry) {
            await navigateInto(entry.path);
            render();
          }
          return;
        }

        // Left — parent (only when search is empty)
        if (key.name === 'left') {
          if (search.length === 0) {
            await navigateToParent();
            render();
          }
          return;
        }

        // Backspace — delete search char or go to parent
        if (key.name === 'backspace') {
          if (search.length > 0) {
            search = search.slice(0, -1);
            applyFilter();
          } else {
            await navigateToParent();
          }
          render();
          return;
        }

        // Regular character — add to search
        if (str && str.length === 1 && !key.ctrl && !key.meta) {
          search += str;
          applyFilter();
          render();
          return;
        }
      } finally {
        busy = false;
      }
    }

    stdin.on('keypress', handleKey);
    render();
  });
}
