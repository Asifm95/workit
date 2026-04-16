import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import pc from "picocolors";
import { pathExists } from "../utils/fs";
import type { Project } from "../core/project-discovery";

export interface DirEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

const EXCLUDED = new Set(["node_modules"]);

function isDotfile(name: string): boolean {
  return name.startsWith(".");
}

export function abbreviatePath(p: string, home: string): string {
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p;
}

async function checkGit(
  path: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const result = await pathExists(join(path, ".git"));
  cache.set(path, result);
  return result;
}

export async function listDir(
  dir: string,
  cache: Map<string, boolean>,
): Promise<DirEntry[]> {
  try {
    const raw = await readdir(dir, { withFileTypes: true });
    const dirs = raw
      .filter((e) => e.isDirectory() && !EXCLUDED.has(e.name) && !isDotfile(e.name))
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

export async function directoryPicker(opts: {
  cwd: string;
}): Promise<Project[]> {
  const home = homedir();
  const gitCache = new Map<string, boolean>();
  const selected = new Set<string>();
  let cwd = resolve(opts.cwd);
  let entries: DirEntry[] = [];
  let filtered: DirEntry[] = [];
  let search = "";
  let cursor = 0;
  let prevLineCount = 0;
  let busy = false;

  const containingRepo = await findContainingRepo(cwd, gitCache);
  if (containingRepo) selected.add(containingRepo);

  entries = await listDir(cwd, gitCache);
  filtered = entries;

  return new Promise<Project[]>((resolvePromise) => {
    const { stdin, stdout } = process;

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdout.write("\x1B[?25l"); // hide cursor

    function render() {
      if (prevLineCount > 0) {
        stdout.write(`\x1B[${prevLineCount}A\x1B[J`);
      }

      const lines: string[] = [];
      const selCount = selected.size;
      const cwdDisplay = abbreviatePath(cwd, home);

      lines.push(
        pc.bold("  Select git repos") +
          pc.dim("  Tab toggle · Enter confirm"),
      );
      lines.push(
        `  ${pc.cyan(cwdDisplay)}` +
          (selCount > 0 ? `  ${pc.green(String(selCount) + " selected")}` : ""),
      );
      lines.push("");

      // Search input
      if (search) {
        lines.push(`  ${pc.yellow("/")} ${search}${pc.dim("▌")}`);
      } else {
        lines.push(`  ${pc.dim("/ type to filter...")}`);
      }
      lines.push("");

      // Parent directory entry
      const parentCursor = cursor === -1;
      const parentPtr = parentCursor ? pc.cyan("❯") : " ";
      lines.push(`  ${parentPtr} ${pc.dim("..")}  ${pc.dim("(parent)")}`);

      // Directory entries
      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i]!;
        const isCursor = i === cursor;
        const ptr = isCursor ? pc.cyan("❯") : " ";

        if (entry.isGitRepo) {
          const isSel = selected.has(entry.path);
          const check = isSel ? pc.green("[x]") : pc.dim("[ ]");
          const name = isCursor ? pc.bold(pc.white(entry.name + "/")) : entry.name + "/";
          lines.push(`  ${ptr} ${name}  ${check} ${pc.dim("git")}`);
        } else {
          const name = pc.dim(entry.name + "/");
          lines.push(`  ${ptr} ${name}  ${pc.dim("dir")}`);
        }
      }

      if (filtered.length === 0) {
        lines.push(pc.dim("    (no matching directories)"));
      }

      lines.push("");
      lines.push(
        pc.dim("  ↑↓ navigate · →/Enter enter dir · ←/Backspace parent · Tab select · Enter confirm"),
      );

      stdout.write(lines.join("\n"));
      prevLineCount = lines.length;
    }

    function applyFilter() {
      const term = search.toLowerCase();
      filtered = term
        ? entries.filter((e) => e.name.toLowerCase().includes(term))
        : entries;
      cursor = Math.min(cursor, Math.max(0, filtered.length - 1));
    }

    async function navigateInto(path: string) {
      cwd = path;
      search = "";
      entries = await listDir(cwd, gitCache);
      filtered = entries;
      cursor = 0;
    }

    async function navigateToParent() {
      const parent = dirname(cwd);
      if (parent === cwd) return;
      cwd = parent;
      search = "";
      entries = await listDir(cwd, gitCache);
      filtered = entries;
      cursor = 0;
    }

    function cleanup() {
      stdin.removeListener("keypress", handleKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1B[?25h\n"); // show cursor
    }

    async function handleKey(str: string | undefined, key: readline.Key) {
      if (busy) return;
      busy = true;
      try {
        // Ctrl+C / Escape — cancel
        if ((key.ctrl && key.name === "c") || key.name === "escape") {
          cleanup();
          process.exit(0);
        }

        // Enter — confirm if selections exist, otherwise enter dir
        if (key.name === "return") {
          if (selected.size > 0) {
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
        if (key.name === "tab") {
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
        if (key.name === "up") {
          cursor = Math.max(0, cursor - 1);
          render();
          return;
        }

        // Down
        if (key.name === "down") {
          cursor = Math.min(filtered.length - 1, cursor + 1);
          render();
          return;
        }

        // Right — enter directory
        if (key.name === "right") {
          const entry = filtered[cursor];
          if (entry) {
            await navigateInto(entry.path);
            render();
          }
          return;
        }

        // Left — parent (only when search is empty)
        if (key.name === "left") {
          if (search.length === 0) {
            await navigateToParent();
            render();
          }
          return;
        }

        // Backspace — delete search char or go to parent
        if (key.name === "backspace") {
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

    stdin.on("keypress", handleKey);
    render();
  });
}
