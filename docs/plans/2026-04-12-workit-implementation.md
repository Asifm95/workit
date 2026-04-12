# workit CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun/TypeScript CLI tool (`workit`) that automates creating multi-project git worktree workspaces with setup scripts and terminal sessions, plus a symmetric cleanup command.

**Architecture:** Single-process CLI, command-router with dedicated orchestrators per command. Pure-function core (slug, naming, template render, plan builder) around impure adapters (git, fs, exec, terminal backends, prompts). Parallel fan-out for worktree creation and setup runs via `Promise.all` over `execa` child processes.

**Tech Stack:** Bun (runtime + test + compile), TypeScript, `commander` (CLI parsing), `@clack/prompts` (interactive prompts), `execa` (child processes), `zod` (config schema), `picocolors` (colors).

**Spec:** `docs/specs/2026-04-12-workit-design.md`

---

## File Structure

Files this plan creates or modifies:

```
workit/
├── package.json                          # Bun project, deps, bin entry
├── tsconfig.json
├── bunfig.toml                           # test config
├── .gitignore
├── README.md                             # minimal
├── src/
│   ├── cli.ts                            # Task 18
│   ├── commands/
│   │   ├── new.ts                        # Task 15
│   │   ├── rm.ts                         # Task 16
│   │   ├── ls.ts                         # Task 17
│   │   └── config.ts                     # Task 17
│   ├── core/
│   │   ├── slug.ts                       # Task 2
│   │   ├── naming.ts                     # Task 2
│   │   ├── config.ts                     # Task 4
│   │   ├── project-discovery.ts          # Task 7
│   │   └── plan.ts                       # Task 14
│   ├── git/
│   │   ├── repo.ts                       # Task 6
│   │   └── worktree.ts                   # Task 6
│   ├── setup/
│   │   └── runner.ts                     # Task 8
│   ├── terminal/
│   │   ├── index.ts                      # Task 12
│   │   ├── none.ts                       # Task 9
│   │   ├── tmux.ts                       # Task 10
│   │   └── cmux.ts                       # Task 11
│   ├── templates/
│   │   ├── render.ts                     # Task 5
│   │   └── workspace-CLAUDE.md.default   # Task 5 (shipped asset)
│   ├── ui/
│   │   ├── prompts.ts                    # Task 13
│   │   └── log.ts                        # Task 13
│   └── utils/
│       ├── fs.ts                         # Task 3
│       └── exec.ts                       # Task 3
└── tests/
    ├── fixtures/
    │   └── make-repo.ts                  # Task 6 (helper for integration tests)
    ├── unit/                             # mirror of src/
    └── integration/
        ├── new.test.ts                   # Task 15
        └── rm.test.ts                    # Task 16
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `.gitignore`
- Create: `src/cli.ts` (placeholder)
- Create: `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "workit",
  "version": "0.1.0",
  "description": "CLI workflow manager for multi-project git worktrees",
  "type": "module",
  "bin": {
    "workit": "./dist/cli.js"
  },
  "scripts": {
    "dev": "bun run src/cli.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "build:npm": "bun build src/cli.ts --target=node --outfile=dist/cli.js --banner '#!/usr/bin/env node'",
    "build:binary": "bun build src/cli.ts --compile --outfile=dist/workit",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.8.2",
    "commander": "^12.1.0",
    "execa": "^9.5.1",
    "picocolors": "^1.1.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.3"
  },
  "engines": {
    "bun": ">=1.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "composite": true,
    "strict": true,
    "downlevelIteration": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "types": ["bun-types"],
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `bunfig.toml`**

```toml
# bun auto-discovers *.test.ts files; reserve this file for future
# test configuration such as preload scripts.
[test]
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
.env
bun.lockb
```

- [ ] **Step 5: Create placeholder `src/cli.ts`**

```typescript
console.log("workit - not yet implemented");
```

- [ ] **Step 6: Create minimal `README.md`**

```markdown
# workit

CLI workflow manager for multi-project git worktrees. See `docs/specs/2026-04-12-workit-design.md` for the design.
```

- [ ] **Step 7: Install dependencies**

Run: `bun install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 8: Verify smoke run**

Run: `bun run src/cli.ts`
Expected: prints `workit - not yet implemented`.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json bunfig.toml .gitignore src/cli.ts README.md
git commit -m "scaffold: bun/ts project, deps, cli placeholder"
```

---

## Task 2: Slug and naming utilities

**Files:**
- Create: `src/core/slug.ts`
- Create: `src/core/naming.ts`
- Test: `tests/unit/core/slug.test.ts`
- Test: `tests/unit/core/naming.test.ts`

- [ ] **Step 1: Write failing slug tests**

Create `tests/unit/core/slug.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { slugify } from "../../../src/core/slug";

describe("slugify", () => {
  test("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Add DAC7 Reporting")).toBe("add-dac7-reporting");
  });

  test("strips punctuation", () => {
    expect(slugify("Fix bug: user's profile!")).toBe("fix-bug-users-profile");
  });

  test("collapses multiple separators", () => {
    expect(slugify("foo  --  bar")).toBe("foo-bar");
  });

  test("trims leading/trailing hyphens", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  test("throws on empty input", () => {
    expect(() => slugify("")).toThrow("empty");
    expect(() => slugify("   ")).toThrow("empty");
  });

  test("throws on input that slugifies to empty", () => {
    expect(() => slugify("!!!")).toThrow("empty");
  });

  test("preserves numbers", () => {
    expect(slugify("SL-560 custom fields")).toBe("sl-560-custom-fields");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/unit/core/slug.test.ts`
Expected: module-not-found error for `slug.ts`.

- [ ] **Step 3: Implement `src/core/slug.ts`**

```typescript
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error(`slug is empty for input: "${input}"`);
  }
  return slug;
}
```

- [ ] **Step 4: Run slug tests**

Run: `bun test tests/unit/core/slug.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Write failing naming tests**

Create `tests/unit/core/naming.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { branchName, folderName, workspaceFolderName } from "../../../src/core/naming";

describe("branchName", () => {
  test("combines type and slug", () => {
    expect(branchName("feat", "add-dac7")).toBe("feat/add-dac7");
  });
});

describe("folderName", () => {
  test("combines project and slug with a dot", () => {
    expect(folderName("storelink-dashboard", "add-dac7")).toBe(
      "storelink-dashboard.add-dac7"
    );
  });
});

describe("workspaceFolderName", () => {
  test("is just the slug", () => {
    expect(workspaceFolderName("add-dac7")).toBe("add-dac7");
  });
});
```

- [ ] **Step 6: Implement `src/core/naming.ts`**

```typescript
export function branchName(type: string, slug: string): string {
  return `${type}/${slug}`;
}

export function folderName(projectName: string, slug: string): string {
  return `${projectName}.${slug}`;
}

export function workspaceFolderName(slug: string): string {
  return slug;
}
```

- [ ] **Step 7: Run naming tests**

Run: `bun test tests/unit/core/naming.test.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/slug.ts src/core/naming.ts tests/unit/core/
git commit -m "core: slug and naming helpers"
```

---

## Task 3: FS and exec utilities

**Files:**
- Create: `src/utils/fs.ts`
- Create: `src/utils/exec.ts`
- Test: `tests/unit/utils/fs.test.ts`
- Test: `tests/unit/utils/exec.test.ts`

- [ ] **Step 1: Write failing fs tests**

Create `tests/unit/utils/fs.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandUser,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from "../../../src/utils/fs";

describe("expandUser", () => {
  test("replaces leading ~ with home directory", () => {
    const home = process.env.HOME!;
    expect(expandUser("~/foo/bar")).toBe(join(home, "foo/bar"));
  });
  test("leaves paths without leading ~ alone", () => {
    expect(expandUser("/abs/path")).toBe("/abs/path");
    expect(expandUser("relative")).toBe("relative");
  });
  test("does not replace ~ in the middle", () => {
    expect(expandUser("/foo/~bar")).toBe("/foo/~bar");
  });
});

describe("pathExists / ensureDir", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-fs-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("pathExists returns false for missing path", async () => {
    expect(await pathExists(join(tmp, "nope"))).toBe(false);
  });
  test("pathExists returns true after writing a file", async () => {
    const p = join(tmp, "f.txt");
    await writeFile(p, "hi");
    expect(await pathExists(p)).toBe(true);
  });
  test("ensureDir creates nested directories", async () => {
    const p = join(tmp, "a/b/c");
    await ensureDir(p);
    expect(await pathExists(p)).toBe(true);
  });
});

describe("readJsonFile / writeJsonFile", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-json-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("writes and reads a JSON object", async () => {
    const p = join(tmp, "data.json");
    await writeJsonFile(p, { a: 1, b: ["x"] });
    const raw = await readFile(p, "utf8");
    expect(JSON.parse(raw)).toEqual({ a: 1, b: ["x"] });
    expect(await readJsonFile(p)).toEqual({ a: 1, b: ["x"] });
  });

  test("writeJsonFile creates parent dirs", async () => {
    const p = join(tmp, "nested/dir/data.json");
    await writeJsonFile(p, { ok: true });
    expect(await pathExists(p)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/unit/utils/fs.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement `src/utils/fs.ts`**

```typescript
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function expandUser(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function readJsonFile<T = unknown>(p: string): Promise<T> {
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(p: string, data: unknown): Promise<void> {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
```

- [ ] **Step 4: Run fs tests**

Run: `bun test tests/unit/utils/fs.test.ts`
Expected: all pass.

- [ ] **Step 5: Write failing exec tests**

Create `tests/unit/utils/exec.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { run, runCapture } from "../../../src/utils/exec";

describe("runCapture", () => {
  test("returns stdout for successful command", async () => {
    const out = await runCapture("echo", ["hello"]);
    expect(out.stdout.trim()).toBe("hello");
    expect(out.exitCode).toBe(0);
  });

  test("throws on non-zero exit", async () => {
    await expect(runCapture("false", [])).rejects.toThrow();
  });

  test("passes cwd through", async () => {
    const out = await runCapture("pwd", [], { cwd: "/tmp" });
    // macOS resolves /tmp to /private/tmp
    expect(out.stdout.trim()).toMatch(/\/tmp$/);
  });
});

describe("run", () => {
  test("returns result without throwing on non-zero exit", async () => {
    const out = await run("false", [], { reject: false });
    expect(out.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 6: Implement `src/utils/exec.ts`**

```typescript
import { execa, type Options, type Result } from "execa";

export type ExecOptions = Options;
export type ExecResult = Result;

export async function run(
  file: string,
  args: readonly string[],
  options: ExecOptions & { reject?: boolean } = {}
): Promise<ExecResult> {
  return execa(file, args, { reject: true, ...options });
}

export async function runCapture(
  file: string,
  args: readonly string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return execa(file, args, { reject: true, ...options });
}
```

- [ ] **Step 7: Run exec tests**

Run: `bun test tests/unit/utils/exec.test.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/utils/ tests/unit/utils/
git commit -m "utils: fs and exec helpers"
```

---

## Task 4: Config schema and loader

**Files:**
- Create: `src/core/config.ts`
- Test: `tests/unit/core/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/unit/core/config.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  loadConfig,
  defaultConfigPath,
} from "../../../src/core/config";

describe("ConfigSchema", () => {
  test("accepts the default config", () => {
    expect(() => ConfigSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });

  test("rejects unknown defaultTerminal", () => {
    expect(() =>
      ConfigSchema.parse({ ...DEFAULT_CONFIG, defaultTerminal: "foo" })
    ).toThrow();
  });

  test("rejects empty projectRoots", () => {
    expect(() =>
      ConfigSchema.parse({ ...DEFAULT_CONFIG, projectRoots: [] })
    ).toThrow();
  });
});

describe("loadConfig", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-cfg-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("creates default config when missing", async () => {
    const path = join(tmp, "config.json");
    const { config, created } = await loadConfig(path);
    expect(created).toBe(true);
    expect(config.workspacesDir).toContain(".workit/workspaces");
    expect(config.projectRoots.length).toBeGreaterThan(0);
  });

  test("loads an existing config", async () => {
    const path = join(tmp, "config.json");
    await writeFile(
      path,
      JSON.stringify({
        workspacesDir: "~/w",
        projectRoots: ["~/p"],
        defaultBranchType: "fix",
        defaultTerminal: "tmux",
        terminalCommand: {},
        templates: { workspaceClaudeMd: "~/t" },
        setupScriptPaths: ["./setup.sh"],
      })
    );
    const { config, created } = await loadConfig(path);
    expect(created).toBe(false);
    expect(config.defaultBranchType).toBe("fix");
    expect(config.defaultTerminal).toBe("tmux");
  });

  test("throws on invalid config", async () => {
    const path = join(tmp, "config.json");
    await writeFile(path, JSON.stringify({ workspacesDir: 42 }));
    await expect(loadConfig(path)).rejects.toThrow();
  });
});

describe("defaultConfigPath", () => {
  test("returns ~/.config/workit/config.json expanded", () => {
    const p = defaultConfigPath();
    expect(p).toMatch(/\.config\/workit\/config\.json$/);
    expect(p.startsWith("/")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/unit/core/config.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement `src/core/config.ts`**

```typescript
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { expandUser, pathExists, readJsonFile, writeJsonFile } from "../utils/fs";

export const ConfigSchema = z.object({
  workspacesDir: z.string().min(1),
  projectRoots: z.array(z.string().min(1)).min(1),
  defaultBranchType: z.string().min(1),
  defaultTerminal: z.enum(["auto", "cmux", "tmux", "none"]),
  terminalCommand: z.object({
    cmux: z.string().optional(),
  }),
  templates: z.object({
    workspaceClaudeMd: z.string().min(1),
  }),
  setupScriptPaths: z.array(z.string().min(1)).min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  workspacesDir: "~/.workit/workspaces",
  projectRoots: ["~/Projects"],
  defaultBranchType: "feat",
  defaultTerminal: "auto",
  terminalCommand: {
    cmux: "/Applications/cmux.app/Contents/Resources/bin/cmux",
  },
  templates: {
    workspaceClaudeMd: "~/.config/workit/templates/workspace-CLAUDE.md",
  },
  setupScriptPaths: ["./setup.sh", ".workit/setup.sh"],
};

export function defaultConfigPath(): string {
  return join(homedir(), ".config", "workit", "config.json");
}

export async function loadConfig(
  path: string = defaultConfigPath()
): Promise<{ config: Config; created: boolean; path: string }> {
  if (!(await pathExists(path))) {
    await writeJsonFile(path, DEFAULT_CONFIG);
    return { config: DEFAULT_CONFIG, created: true, path };
  }
  const raw = await readJsonFile(path);
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid config at ${path}: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    );
  }
  return { config: parsed.data, created: false, path };
}

export function resolveConfigPaths(config: Config): Config & {
  resolvedWorkspacesDir: string;
  resolvedProjectRoots: string[];
  resolvedWorkspaceClaudeTemplate: string;
} {
  return {
    ...config,
    resolvedWorkspacesDir: expandUser(config.workspacesDir),
    resolvedProjectRoots: config.projectRoots.map(expandUser),
    resolvedWorkspaceClaudeTemplate: expandUser(config.templates.workspaceClaudeMd),
  };
}
```

- [ ] **Step 4: Run config tests**

Run: `bun test tests/unit/core/config.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/unit/core/config.test.ts
git commit -m "core: config schema + loader"
```

---

## Task 5: Template renderer + default template asset

**Files:**
- Create: `src/templates/render.ts`
- Create: `src/templates/workspace-CLAUDE.md.default`
- Test: `tests/unit/templates/render.test.ts`

- [ ] **Step 1: Write failing render tests**

Create `tests/unit/templates/render.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { renderTemplate } from "../../../src/templates/render";

describe("renderTemplate", () => {
  test("substitutes simple keys", () => {
    const out = renderTemplate("Hello {{name}}", { name: "world" });
    expect(out).toBe("Hello world");
  });

  test("substitutes multiple occurrences of same key", () => {
    const out = renderTemplate("{{x}} and {{x}}", { x: "foo" });
    expect(out).toBe("foo and foo");
  });

  test("leaves unknown keys intact", () => {
    const out = renderTemplate("{{known}} {{unknown}}", { known: "ok" });
    expect(out).toBe("ok {{unknown}}");
  });

  test("expands {{#each projects}}...{{/each}} blocks", () => {
    const tpl =
      "Projects:\n{{#each projects}}- {{folder}} ({{name}})\n{{/each}}";
    const out = renderTemplate(tpl, {
      projects: [
        { folder: "a.slug", name: "a" },
        { folder: "b.slug", name: "b" },
      ],
    });
    expect(out).toBe("Projects:\n- a.slug (a)\n- b.slug (b)\n");
  });

  test("each block with zero projects renders empty", () => {
    const out = renderTemplate("Start\n{{#each projects}}x\n{{/each}}End", {
      projects: [],
    });
    expect(out).toBe("Start\nEnd");
  });

  test("handles simple keys outside an each block that also contains them", () => {
    const tpl =
      "# {{title}}\n\n{{#each projects}}- {{name}}\n{{/each}}";
    const out = renderTemplate(tpl, {
      title: "My Feature",
      projects: [{ name: "p1" }],
    });
    expect(out).toBe("# My Feature\n\n- p1\n");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/unit/templates/render.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement `src/templates/render.ts`**

```typescript
export type TemplateValue = string | number | boolean;
export type TemplateContext = {
  [key: string]: TemplateValue | TemplateContext[] | undefined;
};

const EACH_RE = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const KEY_RE = /\{\{(\w+)\}\}/g;

function substituteKeys(str: string, ctx: TemplateContext): string {
  return str.replace(KEY_RE, (match, key: string) => {
    const value = ctx[key];
    if (value == null || typeof value === "object") return match;
    return String(value);
  });
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const expanded = template.replace(EACH_RE, (_match, key: string, body: string) => {
    const list = ctx[key];
    if (!Array.isArray(list)) return "";
    return list.map((item) => substituteKeys(body, item)).join("");
  });
  return substituteKeys(expanded, ctx);
}
```

- [ ] **Step 4: Run render tests**

Run: `bun test tests/unit/templates/render.test.ts`
Expected: all 6 pass.

- [ ] **Step 5: Create default template asset**

Create `src/templates/workspace-CLAUDE.md.default`:

```markdown
# {{feature_title}} — Workspace

This is the workspace folder for developing the **{{feature_title}}** feature.

## Structure

The parent directory contains subdirectories, each of which is a separate git project (repository) required to implement this feature. Each subdirectory is already set up as a git worktree and is checked out on the relevant feature branch — do not create new worktrees or switch branches inside them.

Current subprojects:

{{#each projects}}
- [`{{folder}}/`](./{{folder}}/CLAUDE.md) — see its `CLAUDE.md` for project-specific instructions.
{{/each}}

## Working in this workspace

When working inside a subdirectory, follow the instructions in that subdirectory's own `CLAUDE.md`. Those files are authoritative for their respective projects.
```

- [ ] **Step 6: Commit**

```bash
git add src/templates/ tests/unit/templates/
git commit -m "templates: tiny renderer + default workspace CLAUDE.md"
```

---

## Task 6: Git repo and worktree wrappers

**Files:**
- Create: `src/git/repo.ts`
- Create: `src/git/worktree.ts`
- Create: `tests/fixtures/make-repo.ts`
- Test: `tests/unit/git/repo.test.ts`
- Test: `tests/unit/git/worktree.test.ts`

- [ ] **Step 1: Create repo fixture helper**

Create `tests/fixtures/make-repo.ts`:

```typescript
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

export async function makeRepo(prefix = "workit-repo-"): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  await execa("git", ["init", "-q", "-b", "main"], { cwd: path });
  await execa("git", ["config", "user.email", "t@t"], { cwd: path });
  await execa("git", ["config", "user.name", "t"], { cwd: path });
  await writeFile(join(path, "README.md"), "hi\n");
  await execa("git", ["add", "."], { cwd: path, env });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: path, env });
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 2: Write failing repo tests**

Create `tests/unit/git/repo.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { execa } from "execa";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRepo } from "../../fixtures/make-repo";
import {
  isGitRepo,
  currentBranch,
  branchExists,
  isDirty,
  hasUnpushedCommits,
} from "../../../src/git/repo";

describe("isGitRepo", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns true for a git repo", async () => {
    expect(await isGitRepo(repo.path)).toBe(true);
  });
  test("returns false for a non-repo", async () => {
    expect(await isGitRepo("/tmp")).toBe(false);
  });
});

describe("currentBranch", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns the initial branch name", async () => {
    expect(await currentBranch(repo.path)).toBe("main");
  });
});

describe("branchExists", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns true for main", async () => {
    expect(await branchExists(repo.path, "main")).toBe(true);
  });
  test("returns false for unknown branch", async () => {
    expect(await branchExists(repo.path, "nope")).toBe(false);
  });
});

describe("isDirty", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns false for a clean repo", async () => {
    expect(await isDirty(repo.path)).toBe(false);
  });
  test("returns true when there is an uncommitted change", async () => {
    await writeFile(join(repo.path, "README.md"), "changed\n");
    expect(await isDirty(repo.path)).toBe(true);
  });
});

describe("hasUnpushedCommits", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns false when no upstream is configured", async () => {
    // no remote tracking → nothing to compare against → treat as no unpushed
    expect(await hasUnpushedCommits(repo.path, "main")).toBe(false);
  });
});
```

- [ ] **Step 3: Implement `src/git/repo.ts`**

```typescript
import { execa } from "execa";

async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  const r = await execa("git", args, { cwd, reject: false });
  return r.exitCode === 0;
}

async function gitOut(cwd: string, args: string[]): Promise<string> {
  const r = await execa("git", args, { cwd, reject: true });
  return r.stdout.trim();
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]);
}

export async function currentBranch(cwd: string): Promise<string> {
  return gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function branchExists(cwd: string, name: string): Promise<boolean> {
  return gitOk(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
}

export async function isDirty(cwd: string): Promise<boolean> {
  const out = await gitOut(cwd, ["status", "--porcelain"]);
  return out.length > 0;
}

export async function hasUnpushedCommits(cwd: string, branch: string): Promise<boolean> {
  const upstream = await execa(
    "git",
    ["rev-parse", "--abbrev-ref", `${branch}@{u}`],
    { cwd, reject: false }
  );
  if (upstream.exitCode !== 0) return false;
  const ahead = await gitOut(cwd, [
    "rev-list",
    "--count",
    `${upstream.stdout.trim()}..${branch}`,
  ]);
  return Number(ahead) > 0;
}

export async function deleteBranch(cwd: string, name: string): Promise<void> {
  await execa("git", ["branch", "-D", name], { cwd, reject: true });
}

export async function mainWorktreePath(cwd: string): Promise<string> {
  const out = await gitOut(cwd, ["worktree", "list", "--porcelain"]);
  const first = out.split("\n\n")[0]!;
  const line = first.split("\n").find((l) => l.startsWith("worktree "))!;
  return line.slice("worktree ".length);
}
```

- [ ] **Step 4: Run repo tests**

Run: `bun test tests/unit/git/repo.test.ts`
Expected: all pass.

- [ ] **Step 5: Write failing worktree tests**

Create `tests/unit/git/worktree.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../../fixtures/make-repo";
import { addWorktree, removeWorktree } from "../../../src/git/worktree";
import { branchExists } from "../../../src/git/repo";
import { pathExists } from "../../../src/utils/fs";

describe("addWorktree / removeWorktree", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  let workdir: string;
  beforeEach(async () => {
    repo = await makeRepo();
    workdir = await mkdtemp(join(tmpdir(), "workit-wt-"));
  });
  afterEach(async () => {
    await repo.cleanup();
    await rm(workdir, { recursive: true, force: true });
  });

  test("addWorktree creates a new branch and directory", async () => {
    const target = join(workdir, "feature");
    await addWorktree({
      mainRepoPath: repo.path,
      targetPath: target,
      branch: "feat/thing",
    });
    expect(await pathExists(target)).toBe(true);
    expect(await branchExists(repo.path, "feat/thing")).toBe(true);
  });

  test("removeWorktree removes the directory", async () => {
    const target = join(workdir, "feature");
    await addWorktree({
      mainRepoPath: repo.path,
      targetPath: target,
      branch: "feat/thing",
    });
    await removeWorktree({ mainRepoPath: repo.path, targetPath: target });
    expect(await pathExists(target)).toBe(false);
  });
});
```

- [ ] **Step 6: Implement `src/git/worktree.ts`**

```typescript
import { execa } from "execa";

export interface AddWorktreeArgs {
  mainRepoPath: string;
  targetPath: string;
  branch: string;
  reuseExistingBranch?: boolean;
}

export async function addWorktree(args: AddWorktreeArgs): Promise<void> {
  const { mainRepoPath, targetPath, branch, reuseExistingBranch } = args;
  const cmd = reuseExistingBranch
    ? ["worktree", "add", targetPath, branch]
    : ["worktree", "add", targetPath, "-b", branch];
  await execa("git", cmd, { cwd: mainRepoPath, reject: true });
}

export interface RemoveWorktreeArgs {
  mainRepoPath: string;
  targetPath: string;
  force?: boolean;
}

export async function removeWorktree(args: RemoveWorktreeArgs): Promise<void> {
  const { mainRepoPath, targetPath, force } = args;
  const flags = force ? ["--force"] : [];
  await execa("git", ["worktree", "remove", ...flags, targetPath], {
    cwd: mainRepoPath,
    reject: true,
  });
}
```

- [ ] **Step 7: Run worktree tests**

Run: `bun test tests/unit/git/`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/git/ tests/unit/git/ tests/fixtures/
git commit -m "git: repo inspection + worktree add/remove wrappers"
```

---

## Task 7: Project discovery with caching

**Files:**
- Create: `src/core/project-discovery.ts`
- Test: `tests/unit/core/project-discovery.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/core/project-discovery.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import {
  discoverProjects,
  findProjectContaining,
} from "../../../src/core/project-discovery";

async function initRepo(path: string) {
  await execa("git", ["init", "-q", path]);
}

describe("discoverProjects", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-disc-"));
    await mkdir(join(root, "r1"));
    await mkdir(join(root, "r2"));
    await mkdir(join(root, "not-a-repo"));
    await initRepo(join(root, "r1"));
    await initRepo(join(root, "r2"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("finds repos one level under a root", async () => {
    const projects = await discoverProjects([root]);
    const names = projects.map((p) => p.name).sort();
    expect(names).toEqual(["r1", "r2"]);
  });

  test("skips directories without .git", async () => {
    const projects = await discoverProjects([root]);
    expect(projects.find((p) => p.name === "not-a-repo")).toBeUndefined();
  });

  test("handles missing root directories gracefully", async () => {
    const projects = await discoverProjects([
      root,
      join(root, "does-not-exist"),
    ]);
    expect(projects.length).toBe(2);
  });
});

describe("findProjectContaining", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-disc-"));
    await mkdir(join(root, "r1"));
    await initRepo(join(root, "r1"));
    await mkdir(join(root, "r1", "sub"));
    await writeFile(join(root, "r1", "sub", "file.txt"), "x");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns the project when cwd is inside it", async () => {
    const projects = await discoverProjects([root]);
    const hit = findProjectContaining(projects, join(root, "r1", "sub"));
    expect(hit?.name).toBe("r1");
  });

  test("returns undefined when cwd is not under any project", async () => {
    const projects = await discoverProjects([root]);
    const hit = findProjectContaining(projects, "/tmp");
    expect(hit).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `src/core/project-discovery.ts`**

```typescript
import { readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathExists } from "../utils/fs";

export interface Project {
  name: string;
  path: string;
}

async function listSubdirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name));
  } catch {
    return [];
  }
}

async function isGitDir(path: string): Promise<boolean> {
  return pathExists(join(path, ".git"));
}

export async function discoverProjects(roots: string[]): Promise<Project[]> {
  const results: Project[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    for (const dir of await listSubdirs(root)) {
      if (await isGitDir(dir)) {
        const resolved = resolve(dir);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        results.push({ name: dir.split(sep).pop()!, path: resolved });
      }
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export function findProjectContaining(
  projects: Project[],
  cwd: string
): Project | undefined {
  const resolved = resolve(cwd);
  return projects.find(
    (p) => resolved === p.path || resolved.startsWith(p.path + sep)
  );
}

// Cache ----------------------------------------------------------------
import { readJsonFile, writeJsonFile } from "../utils/fs";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheFile {
  version: 1;
  refreshedAt: string;
  projects: Project[];
}

export async function loadProjectsCached(
  cachePath: string,
  roots: string[],
  forceRefresh: boolean
): Promise<Project[]> {
  if (!forceRefresh && (await pathExists(cachePath))) {
    try {
      const cache = await readJsonFile<CacheFile>(cachePath);
      const age = Date.now() - new Date(cache.refreshedAt).getTime();
      if (cache.version === 1 && age < CACHE_TTL_MS) {
        return cache.projects;
      }
    } catch {
      // fall through to refresh
    }
  }
  const projects = await discoverProjects(roots);
  const cache: CacheFile = {
    version: 1,
    refreshedAt: new Date().toISOString(),
    projects,
  };
  await writeJsonFile(cachePath, cache);
  return projects;
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/unit/core/project-discovery.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/project-discovery.ts tests/unit/core/project-discovery.test.ts
git commit -m "core: project discovery + cache"
```

---

## Task 8: Setup runner

**Files:**
- Create: `src/setup/runner.ts`
- Test: `tests/unit/setup/runner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/setup/runner.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findSetupScript,
  runSetupScripts,
} from "../../../src/setup/runner";

describe("findSetupScript", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "workit-setup-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("finds ./setup.sh when present", async () => {
    await writeFile(join(dir, "setup.sh"), "#!/bin/bash\necho hi\n");
    await chmod(join(dir, "setup.sh"), 0o755);
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBe(join(dir, "setup.sh"));
  });

  test("finds .workit/setup.sh when ./setup.sh is missing", async () => {
    await mkdir(join(dir, ".workit"));
    await writeFile(join(dir, ".workit", "setup.sh"), "#!/bin/bash\n");
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBe(join(dir, ".workit/setup.sh"));
  });

  test("returns null when no script is present", async () => {
    const found = await findSetupScript(dir, ["./setup.sh", ".workit/setup.sh"]);
    expect(found).toBeNull();
  });
});

describe("runSetupScripts", () => {
  let a: string, b: string;
  beforeEach(async () => {
    a = await mkdtemp(join(tmpdir(), "workit-setup-a-"));
    b = await mkdtemp(join(tmpdir(), "workit-setup-b-"));
    await writeFile(join(a, "setup.sh"), "#!/bin/bash\necho A-ok\n");
    await chmod(join(a, "setup.sh"), 0o755);
    // b has no setup script
  });
  afterEach(async () => {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  test("runs scripts in parallel and reports missing ones", async () => {
    const logs: string[] = [];
    const results = await runSetupScripts({
      targets: [
        { name: "A", cwd: a },
        { name: "B", cwd: b },
      ],
      scriptPaths: ["./setup.sh", ".workit/setup.sh"],
      onLine: (name, line) => logs.push(`[${name}] ${line}`),
    });
    expect(results.find((r) => r.name === "A")?.status).toBe("ok");
    expect(results.find((r) => r.name === "B")?.status).toBe("missing");
    expect(logs.some((l) => l.includes("A-ok"))).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/setup/runner.ts`**

```typescript
import { execa } from "execa";
import { join } from "node:path";
import { pathExists } from "../utils/fs";

export async function findSetupScript(
  cwd: string,
  candidates: string[]
): Promise<string | null> {
  for (const rel of candidates) {
    const normalized = rel.startsWith("./") ? rel.slice(2) : rel;
    const full = join(cwd, normalized);
    if (await pathExists(full)) return full;
  }
  return null;
}

export interface SetupTarget {
  name: string;
  cwd: string;
}

export type SetupStatus = "ok" | "missing" | "failed";
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
  onLine: (name: string, line: string) => void
): Promise<SetupResult> {
  const script = await findSetupScript(target.cwd, scriptPaths);
  if (!script) {
    return { name: target.name, status: "missing", scriptPath: null, exitCode: null };
  }
  try {
    const child = execa("bash", [script], { cwd: target.cwd, all: true });
    child.all?.on("data", (chunk: Buffer) => {
      chunk.toString("utf8").split("\n").forEach((line) => {
        if (line.length > 0) onLine(target.name, line);
      });
    });
    const result = await child;
    return {
      name: target.name,
      status: "ok",
      scriptPath: script,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: any) {
    return {
      name: target.name,
      status: "failed",
      scriptPath: script,
      exitCode: err.exitCode ?? null,
      error: err.shortMessage ?? String(err),
    };
  }
}

export async function runSetupScripts(
  options: RunSetupOptions
): Promise<SetupResult[]> {
  return Promise.all(
    options.targets.map((t) => runOne(t, options.scriptPaths, options.onLine))
  );
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/unit/setup/runner.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/setup/ tests/unit/setup/
git commit -m "setup: parallel setup.sh runner with prefixed output"
```

---

## Task 9: Terminal `none` backend

**Files:**
- Create: `src/terminal/none.ts`
- Test: `tests/unit/terminal/none.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/terminal/none.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { formatNoneBackendOutput } from "../../../src/terminal/none";

describe("formatNoneBackendOutput", () => {
  test("prints paths and a cd hint for workspace", () => {
    const out = formatNoneBackendOutput({
      workspacePath: "/w/feat",
      tabs: [
        { name: "a", cwd: "/w/feat/a.feat" },
        { name: "b", cwd: "/w/feat/b.feat" },
      ],
    });
    expect(out).toContain("[a]");
    expect(out).toContain("/w/feat/a.feat");
    expect(out).toContain("cd /w/feat");
  });

  test("single worktree prints just its cd hint", () => {
    const out = formatNoneBackendOutput({
      workspacePath: null,
      tabs: [{ name: "only", cwd: "/w/only.slug" }],
    });
    expect(out).toContain("cd /w/only.slug");
  });
});
```

- [ ] **Step 2: Implement `src/terminal/none.ts`**

```typescript
import pc from "picocolors";

export interface TabSpec {
  name: string;
  cwd: string;
}

export interface NoneBackendArgs {
  workspacePath: string | null;
  tabs: TabSpec[];
}

export function formatNoneBackendOutput(args: NoneBackendArgs): string {
  const lines: string[] = [pc.bold("Created worktrees:")];
  const width = Math.max(...args.tabs.map((t) => t.name.length));
  for (const tab of args.tabs) {
    const label = `[${tab.name}]`.padEnd(width + 3);
    lines.push(`  ${pc.cyan(label)} ${tab.cwd}`);
  }
  lines.push("");
  const cdTarget = args.workspacePath ?? args.tabs[0]!.cwd;
  lines.push(`${pc.bold("Next:")} cd ${cdTarget}`);
  return lines.join("\n");
}

export function runNoneBackend(args: NoneBackendArgs): void {
  console.log(formatNoneBackendOutput(args));
}
```

- [ ] **Step 3: Run tests & commit**

Run: `bun test tests/unit/terminal/none.test.ts`
Expected: pass.

```bash
git add src/terminal/none.ts tests/unit/terminal/
git commit -m "terminal: none backend (print paths)"
```

---

## Task 10: Terminal `tmux` backend

**Files:**
- Create: `src/terminal/tmux.ts`
- Test: `tests/unit/terminal/tmux.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/terminal/tmux.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  sanitizeSessionName,
  buildTmuxCommands,
} from "../../../src/terminal/tmux";

describe("sanitizeSessionName", () => {
  test("replaces dots and colons", () => {
    expect(sanitizeSessionName("feat.x:y")).toBe("feat-x-y");
  });
  test("leaves valid names alone", () => {
    expect(sanitizeSessionName("add-dac7")).toBe("add-dac7");
  });
});

describe("buildTmuxCommands", () => {
  test("emits new-session and new-window for each tab", () => {
    const cmds = buildTmuxCommands({
      sessionName: "add-dac7",
      tabs: [
        { name: "a", cwd: "/w/a" },
        { name: "b", cwd: "/w/b" },
        { name: "c", cwd: "/w/c" },
      ],
    });
    expect(cmds).toEqual([
      ["new-session", "-d", "-s", "add-dac7", "-n", "a", "-c", "/w/a"],
      ["new-window", "-t", "add-dac7:", "-n", "b", "-c", "/w/b"],
      ["new-window", "-t", "add-dac7:", "-n", "c", "-c", "/w/c"],
    ]);
  });

  test("handles single tab", () => {
    const cmds = buildTmuxCommands({
      sessionName: "x",
      tabs: [{ name: "only", cwd: "/w/only" }],
    });
    expect(cmds).toEqual([
      ["new-session", "-d", "-s", "x", "-n", "only", "-c", "/w/only"],
    ]);
  });
});
```

- [ ] **Step 2: Implement `src/terminal/tmux.ts`**

```typescript
import { execa, execaSync } from "execa";
import type { TabSpec } from "./none";

export function sanitizeSessionName(name: string): string {
  return name.replace(/[.:]/g, "-");
}

export interface BuildTmuxArgs {
  sessionName: string;
  tabs: TabSpec[];
}

export function buildTmuxCommands(args: BuildTmuxArgs): string[][] {
  const { sessionName, tabs } = args;
  const cmds: string[][] = [];
  const [first, ...rest] = tabs;
  if (!first) return cmds;
  cmds.push([
    "new-session", "-d", "-s", sessionName, "-n", first.name, "-c", first.cwd,
  ]);
  for (const tab of rest) {
    cmds.push([
      "new-window", "-t", `${sessionName}:`, "-n", tab.name, "-c", tab.cwd,
    ]);
  }
  return cmds;
}

export async function tmuxInstalled(): Promise<boolean> {
  try {
    await execa("tmux", ["-V"]);
    return true;
  } catch {
    return false;
  }
}

export function insideTmux(): boolean {
  return typeof process.env.TMUX === "string" && process.env.TMUX.length > 0;
}

async function sessionExists(name: string): Promise<boolean> {
  const r = await execa("tmux", ["has-session", `-t=${name}`], { reject: false });
  return r.exitCode === 0;
}

export interface RunTmuxArgs {
  featureSlug: string;
  tabs: TabSpec[];
}

export async function runTmuxBackend(args: RunTmuxArgs): Promise<void> {
  const sessionName = sanitizeSessionName(args.featureSlug);

  if (!(await sessionExists(sessionName))) {
    const commands = buildTmuxCommands({ sessionName, tabs: args.tabs });
    for (const cmd of commands) {
      await execa("tmux", cmd, { reject: true });
    }
  }

  if (insideTmux()) {
    await execa("tmux", ["switch-client", "-t", sessionName], { reject: true });
    return;
  }

  if (process.stdin.isTTY) {
    execaSync("tmux", ["attach-session", "-t", sessionName], { stdio: "inherit" });
  } else {
    console.log(`tmux session ready: ${sessionName}`);
    console.log(`Attach with: tmux attach -t ${sessionName}`);
  }
}
```

- [ ] **Step 3: Run unit tests**

Run: `bun test tests/unit/terminal/tmux.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/terminal/tmux.ts tests/unit/terminal/tmux.test.ts
git commit -m "terminal: tmux backend"
```

---

## Task 11: Terminal `cmux` backend

**Files:**
- Create: `src/terminal/cmux.ts`
- Test: `tests/unit/terminal/cmux.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/terminal/cmux.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { planCmuxCommands } from "../../../src/terminal/cmux";

describe("planCmuxCommands", () => {
  test("first tab becomes the workspace cwd, subsequent tabs are new surfaces with cd sends", () => {
    const plan = planCmuxCommands({
      workspaceName: "add-dac7",
      tabs: [
        { name: "a", cwd: "/w/a" },
        { name: "b", cwd: "/w/b" },
      ],
    });
    expect(plan[0]).toEqual({
      kind: "new-workspace",
      args: [
        "new-workspace",
        "--name", "add-dac7",
        "--cwd", "/w/a",
        "--id-format", "refs",
      ],
    });
    expect(plan[1]).toEqual({
      kind: "rename-first-tab",
      args: ["rename-tab", "--workspace", "{{workspace}}", "--surface", "{{first}}", "a"],
    });
    expect(plan[2]).toEqual({
      kind: "new-surface",
      args: ["new-surface", "--type", "terminal", "--workspace", "{{workspace}}"],
      tab: { name: "b", cwd: "/w/b" },
    });
  });

  test("single-tab case still renames first tab", () => {
    const plan = planCmuxCommands({
      workspaceName: "x",
      tabs: [{ name: "only", cwd: "/w/only" }],
    });
    expect(plan.length).toBe(2);
    expect(plan[0]?.kind).toBe("new-workspace");
    expect(plan[1]?.kind).toBe("rename-first-tab");
  });
});
```

- [ ] **Step 2: Implement `src/terminal/cmux.ts`**

```typescript
import { execa } from "execa";
import { pathExists } from "../utils/fs";
import type { TabSpec } from "./none";

export interface CmuxPlanStep {
  kind: "new-workspace" | "rename-first-tab" | "new-surface" | "send-cd" | "rename-tab";
  args: string[];
  tab?: TabSpec;
}

export interface PlanCmuxArgs {
  workspaceName: string;
  tabs: TabSpec[];
}

export function planCmuxCommands(args: PlanCmuxArgs): CmuxPlanStep[] {
  const { workspaceName, tabs } = args;
  const plan: CmuxPlanStep[] = [];
  const [first, ...rest] = tabs;
  if (!first) return plan;

  plan.push({
    kind: "new-workspace",
    args: [
      "new-workspace",
      "--name", workspaceName,
      "--cwd", first.cwd,
      "--id-format", "refs",
    ],
  });
  plan.push({
    kind: "rename-first-tab",
    args: [
      "rename-tab",
      "--workspace", "{{workspace}}",
      "--surface", "{{first}}",
      first.name,
    ],
  });
  for (const tab of rest) {
    plan.push({
      kind: "new-surface",
      args: ["new-surface", "--type", "terminal", "--workspace", "{{workspace}}"],
      tab,
    });
  }
  return plan;
}

export async function cmuxInstalled(binary: string): Promise<boolean> {
  if (!(await pathExists(binary))) return false;
  try {
    await execa(binary, ["--help"], { reject: false });
    return true;
  } catch {
    return false;
  }
}

export function insideCmux(): boolean {
  return (
    typeof process.env.CMUX_WORKSPACE_ID === "string" &&
    process.env.CMUX_WORKSPACE_ID.length > 0
  );
}

export interface RunCmuxArgs {
  binary: string;
  featureSlug: string;
  tabs: TabSpec[];
}

function parseRef(stdout: string): string {
  return stdout.trim().split(/\s+/)[0] ?? stdout.trim();
}

export async function runCmuxBackend(args: RunCmuxArgs): Promise<void> {
  const { binary, featureSlug, tabs } = args;
  const [first, ...rest] = tabs;
  if (!first) return;

  const createRes = await execa(
    binary,
    [
      "new-workspace",
      "--name", featureSlug,
      "--cwd", first.cwd,
      "--id-format", "refs",
    ],
    { reject: true }
  );
  const workspace = parseRef(createRes.stdout);

  const firstSurfaceRes = await execa(
    binary,
    [
      "list-surfaces",
      "--workspace", workspace,
      "--id-format", "refs",
    ],
    { reject: false }
  );
  const firstSurface = firstSurfaceRes.exitCode === 0
    ? parseRef(firstSurfaceRes.stdout)
    : "surface:1";

  await execa(
    binary,
    ["rename-tab", "--workspace", workspace, "--surface", firstSurface, first.name],
    { reject: false }
  );

  for (const tab of rest) {
    const surfRes = await execa(
      binary,
      ["new-surface", "--type", "terminal", "--workspace", workspace],
      { reject: true }
    );
    const surface = parseRef(surfRes.stdout);
    await execa(
      binary,
      ["send", "--workspace", workspace, "--surface", surface, `cd ${tab.cwd}\n`],
      { reject: true }
    );
    await execa(
      binary,
      ["rename-tab", "--workspace", workspace, "--surface", surface, tab.name],
      { reject: false }
    );
  }
}
```

- [ ] **Step 3: Run unit tests**

Run: `bun test tests/unit/terminal/cmux.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/terminal/cmux.ts tests/unit/terminal/cmux.test.ts
git commit -m "terminal: cmux backend"
```

---

## Task 12: Terminal dispatcher

**Files:**
- Create: `src/terminal/index.ts`
- Test: `tests/unit/terminal/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/terminal/index.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { selectBackend } from "../../../src/terminal";

describe("selectBackend", () => {
  const base = {
    configDefault: "auto" as const,
    flag: undefined,
    insideTmux: false,
    insideCmux: false,
    tmuxAvailable: true,
    cmuxAvailable: true,
  };

  test("explicit flag wins", () => {
    expect(selectBackend({ ...base, flag: "tmux" })).toBe("tmux");
    expect(selectBackend({ ...base, flag: "none" })).toBe("none");
  });

  test("inside cmux prefers cmux", () => {
    expect(selectBackend({ ...base, insideCmux: true })).toBe("cmux");
  });

  test("inside tmux (not cmux) prefers tmux", () => {
    expect(selectBackend({ ...base, insideTmux: true })).toBe("tmux");
  });

  test("config default overrides auto-detect when not 'auto'", () => {
    expect(selectBackend({ ...base, configDefault: "tmux" })).toBe("tmux");
  });

  test("falls back to first available when configDefault is auto", () => {
    expect(selectBackend({ ...base, tmuxAvailable: false })).toBe("cmux");
    expect(selectBackend({ ...base, cmuxAvailable: false })).toBe("tmux");
  });

  test("falls back to none when nothing is available", () => {
    expect(
      selectBackend({ ...base, tmuxAvailable: false, cmuxAvailable: false })
    ).toBe("none");
  });
});
```

- [ ] **Step 2: Implement `src/terminal/index.ts`**

```typescript
import type { Config } from "../core/config";
import { runNoneBackend, type TabSpec } from "./none";
import {
  runTmuxBackend,
  tmuxInstalled,
  insideTmux,
} from "./tmux";
import {
  runCmuxBackend,
  cmuxInstalled,
  insideCmux,
} from "./cmux";

export type BackendName = "cmux" | "tmux" | "none";

export interface SelectBackendArgs {
  flag?: BackendName;
  configDefault: Config["defaultTerminal"];
  insideTmux: boolean;
  insideCmux: boolean;
  tmuxAvailable: boolean;
  cmuxAvailable: boolean;
}

export function selectBackend(args: SelectBackendArgs): BackendName {
  if (args.flag) return args.flag;
  if (args.insideCmux && args.cmuxAvailable) return "cmux";
  if (args.insideTmux && args.tmuxAvailable) return "tmux";
  if (args.configDefault !== "auto") {
    const d = args.configDefault;
    if (d === "cmux" && args.cmuxAvailable) return "cmux";
    if (d === "tmux" && args.tmuxAvailable) return "tmux";
    if (d === "none") return "none";
  }
  if (args.tmuxAvailable) return "tmux";
  if (args.cmuxAvailable) return "cmux";
  return "none";
}

export interface DispatchArgs {
  backend: BackendName;
  config: Config;
  featureSlug: string;
  workspacePath: string | null;
  tabs: TabSpec[];
}

export async function dispatchBackend(args: DispatchArgs): Promise<void> {
  const { backend, config, featureSlug, workspacePath, tabs } = args;
  switch (backend) {
    case "none":
      runNoneBackend({ workspacePath, tabs });
      return;
    case "tmux":
      await runTmuxBackend({ featureSlug, tabs });
      return;
    case "cmux": {
      const binary = config.terminalCommand.cmux ?? "cmux";
      await runCmuxBackend({ binary, featureSlug, tabs });
      return;
    }
  }
}

export interface DetectAvailabilityResult {
  tmuxAvailable: boolean;
  cmuxAvailable: boolean;
  insideTmux: boolean;
  insideCmux: boolean;
}

export async function detectAvailability(
  config: Config
): Promise<DetectAvailabilityResult> {
  const cmuxBinary = config.terminalCommand.cmux ?? "cmux";
  const [tmux, cmux] = await Promise.all([
    tmuxInstalled(),
    cmuxInstalled(cmuxBinary),
  ]);
  return {
    tmuxAvailable: tmux,
    cmuxAvailable: cmux,
    insideTmux: insideTmux(),
    insideCmux: insideCmux(),
  };
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/unit/terminal/`
Expected: all backend tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/terminal/index.ts tests/unit/terminal/index.test.ts
git commit -m "terminal: dispatcher + backend selection"
```

---

## Task 13: UI prompts and logging

**Files:**
- Create: `src/ui/prompts.ts`
- Create: `src/ui/log.ts`
- Test: `tests/unit/ui/log.test.ts`

- [ ] **Step 1: Write failing log tests**

Create `tests/unit/ui/log.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { prefixLine } from "../../../src/ui/log";

describe("prefixLine", () => {
  test("pads prefix to fixed width and separates with a space", () => {
    expect(prefixLine("A", "hello", 5)).toBe("[A]   hello");
  });
  test("longer prefixes are not truncated", () => {
    expect(prefixLine("long-name", "x", 3)).toBe("[long-name] x");
  });
});
```

- [ ] **Step 2: Implement `src/ui/log.ts`**

```typescript
import pc from "picocolors";

export function prefixLine(name: string, line: string, width: number): string {
  const tag = `[${name}]`;
  const padded = tag.length < width + 2 ? tag.padEnd(width + 2) : tag;
  return `${padded} ${line}`;
}

const COLORS = [pc.cyan, pc.magenta, pc.green, pc.yellow, pc.blue, pc.red];

export function colorFor(name: string): (s: string) => string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function info(msg: string): void {
  console.log(pc.bold(msg));
}
export function warn(msg: string): void {
  console.log(pc.yellow(`⚠ ${msg}`));
}
export function error(msg: string): void {
  console.error(pc.red(`✗ ${msg}`));
}
export function success(msg: string): void {
  console.log(pc.green(`✓ ${msg}`));
}
export function hint(msg: string): void {
  console.log(pc.dim(`💡 ${msg}`));
}
```

- [ ] **Step 3: Implement `src/ui/prompts.ts`**

```typescript
import * as p from "@clack/prompts";
import type { Project } from "../core/project-discovery";

export async function promptDescription(
  initial?: string
): Promise<string> {
  if (initial) return initial;
  const result = await p.text({
    message: "Feature description",
    placeholder: "Add DAC7 reporting",
    validate: (v) => (v.trim().length === 0 ? "required" : undefined),
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as string;
}

export async function promptBranchType(
  initial: string | undefined,
  defaultValue: string
): Promise<string> {
  if (initial) return initial;
  const result = await p.select({
    message: "Branch type",
    initialValue: defaultValue,
    options: [
      { value: "feat", label: "feat" },
      { value: "fix", label: "fix" },
      { value: "chore", label: "chore" },
      { value: "ref", label: "ref" },
      { value: "docs", label: "docs" },
      { value: "test", label: "test" },
    ],
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as string;
}

export async function promptProjectPicker(
  projects: Project[],
  preselected: Project[]
): Promise<Project[]> {
  const result = await p.multiselect({
    message: "Select projects",
    required: true,
    initialValues: preselected.map((p) => p.path),
    options: projects.map((p) => ({ value: p.path, label: p.name })),
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  const picks = result as string[];
  return picks
    .map((path) => projects.find((p) => p.path === path)!)
    .filter(Boolean);
}

export async function promptConfirm(
  message: string,
  initialValue = true
): Promise<boolean> {
  const result = await p.confirm({ message, initialValue });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as boolean;
}

export const prompts = p;
```

- [ ] **Step 4: Run log tests**

Run: `bun test tests/unit/ui/log.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ tests/unit/ui/
git commit -m "ui: clack prompt wrappers + log helpers"
```

---

## Task 14: Plan builders

**Files:**
- Create: `src/core/plan.ts`
- Test: `tests/unit/core/plan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/core/plan.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { buildNewPlan, buildRmPlan } from "../../../src/core/plan";
import type { Project } from "../../../src/core/project-discovery";

const projA: Project = { name: "proj-a", path: "/main/proj-a" };
const projB: Project = { name: "proj-b", path: "/main/proj-b" };

describe("buildNewPlan", () => {
  test("single-project plan has no workspace", () => {
    const plan = buildNewPlan({
      description: "Add DAC7",
      slug: "add-dac7",
      branchType: "feat",
      projects: [projA],
      workspacesDir: "/w",
    });
    expect(plan.isWorkspace).toBe(false);
    expect(plan.workspacePath).toBeNull();
    expect(plan.targets).toEqual([
      {
        project: projA,
        branch: "feat/add-dac7",
        targetPath: "/w/proj-a.add-dac7",
      },
    ]);
  });

  test("multi-project plan creates workspace folder", () => {
    const plan = buildNewPlan({
      description: "Add DAC7",
      slug: "add-dac7",
      branchType: "feat",
      projects: [projA, projB],
      workspacesDir: "/w",
    });
    expect(plan.isWorkspace).toBe(true);
    expect(plan.workspacePath).toBe("/w/add-dac7");
    expect(plan.targets[0]!.targetPath).toBe("/w/add-dac7/proj-a.add-dac7");
    expect(plan.targets[1]!.targetPath).toBe("/w/add-dac7/proj-b.add-dac7");
  });
});

describe("buildRmPlan", () => {
  test("resolves a workspace folder with subdirs to a multi-plan", () => {
    const plan = buildRmPlan({
      name: "add-dac7",
      workspacesDir: "/w",
      entries: [
        {
          kind: "workspace",
          slug: "add-dac7",
          path: "/w/add-dac7",
          worktrees: [
            { project: projA, targetPath: "/w/add-dac7/proj-a.add-dac7", branch: "feat/add-dac7" },
            { project: projB, targetPath: "/w/add-dac7/proj-b.add-dac7", branch: "feat/add-dac7" },
          ],
        },
      ],
    });
    expect(plan.kind).toBe("workspace");
    expect(plan.targets.length).toBe(2);
    expect(plan.workspacePath).toBe("/w/add-dac7");
  });

  test("resolves a single worktree name", () => {
    const plan = buildRmPlan({
      name: "proj-a.add-dac7",
      workspacesDir: "/w",
      entries: [
        {
          kind: "single",
          path: "/w/proj-a.add-dac7",
          target: { project: projA, targetPath: "/w/proj-a.add-dac7", branch: "feat/add-dac7" },
        },
      ],
    });
    expect(plan.kind).toBe("single");
    expect(plan.targets.length).toBe(1);
    expect(plan.workspacePath).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `src/core/plan.ts`**

```typescript
import { join } from "node:path";
import type { Project } from "./project-discovery";
import { branchName, folderName, workspaceFolderName } from "./naming";

export interface WorktreeTarget {
  project: Project;
  branch: string;
  targetPath: string;
}

export interface NewPlan {
  description: string;
  slug: string;
  branchType: string;
  isWorkspace: boolean;
  workspacePath: string | null;
  targets: WorktreeTarget[];
}

export interface BuildNewPlanArgs {
  description: string;
  slug: string;
  branchType: string;
  projects: Project[];
  workspacesDir: string;
}

export function buildNewPlan(args: BuildNewPlanArgs): NewPlan {
  const { description, slug, branchType, projects, workspacesDir } = args;
  const isWorkspace = projects.length > 1;
  const workspacePath = isWorkspace
    ? join(workspacesDir, workspaceFolderName(slug))
    : null;
  const base = workspacePath ?? workspacesDir;
  const branch = branchName(branchType, slug);
  const targets: WorktreeTarget[] = projects.map((project) => ({
    project,
    branch,
    targetPath: join(base, folderName(project.name, slug)),
  }));
  return { description, slug, branchType, isWorkspace, workspacePath, targets };
}

export type WorkspaceEntry =
  | {
      kind: "workspace";
      slug: string;
      path: string;
      worktrees: WorktreeTarget[];
    }
  | {
      kind: "single";
      path: string;
      target: WorktreeTarget;
    };

export interface RmPlan {
  kind: "workspace" | "single";
  workspacePath: string | null;
  targets: WorktreeTarget[];
}

export interface BuildRmPlanArgs {
  name: string;
  workspacesDir: string;
  entries: WorkspaceEntry[];
}

export function buildRmPlan(args: BuildRmPlanArgs): RmPlan {
  const match = args.entries.find((e) => {
    if (e.kind === "workspace") return e.slug === args.name;
    return e.target.targetPath.endsWith(`/${args.name}`);
  });
  if (!match) {
    throw new Error(`No worktree or workspace named "${args.name}" found under ${args.workspacesDir}`);
  }
  if (match.kind === "workspace") {
    return {
      kind: "workspace",
      workspacePath: match.path,
      targets: match.worktrees,
    };
  }
  return { kind: "single", workspacePath: null, targets: [match.target] };
}

export function formatNewPlan(plan: NewPlan): string {
  const lines: string[] = [];
  lines.push(`Description: ${plan.description}`);
  lines.push(`Branch:      ${plan.targets[0]?.branch}`);
  if (plan.isWorkspace) {
    lines.push(`Workspace:   ${plan.workspacePath}`);
  }
  lines.push(`Worktrees:`);
  for (const t of plan.targets) {
    lines.push(`  [${t.project.name}] ${t.targetPath}`);
  }
  return lines.join("\n");
}

export function formatRmPlan(plan: RmPlan): string {
  const lines: string[] = [];
  lines.push(`Removing ${plan.kind}:`);
  if (plan.workspacePath) lines.push(`  folder:  ${plan.workspacePath}`);
  for (const t of plan.targets) {
    lines.push(`  [${t.project.name}] ${t.targetPath}  (branch ${t.branch})`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/unit/core/plan.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/plan.ts tests/unit/core/plan.test.ts
git commit -m "core: new and rm plan builders"
```

---

## Task 15: `workit new` command + integration test

**Files:**
- Create: `src/commands/new.ts`
- Create: `tests/integration/new.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/integration/new.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runNewCommand } from "../../src/commands/new";
import { pathExists } from "../../src/utils/fs";
import type { Config } from "../../src/core/config";

async function setupTestRepo(parent: string, name: string) {
  const repo = join(parent, name);
  await mkdir(repo);
  await execa("git", ["init", "-q", "-b", "main", repo]);
  await execa("git", ["config", "user.email", "t@t"], { cwd: repo });
  await execa("git", ["config", "user.name", "t"], { cwd: repo });
  await writeFile(join(repo, "README.md"), "hi\n");
  await execa("git", ["add", "."], { cwd: repo });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: repo });
  // Seed a setup.sh
  await writeFile(join(repo, "setup.sh"), "#!/bin/bash\necho setup-done\n");
  await chmod(join(repo, "setup.sh"), 0o755);
  return repo;
}

describe("runNewCommand", () => {
  let root: string;
  let workspacesDir: string;
  let projectsRoot: string;
  let config: Config;
  let templatePath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-int-"));
    workspacesDir = join(root, "workspaces");
    projectsRoot = join(root, "projects");
    await mkdir(projectsRoot);
    await setupTestRepo(projectsRoot, "alpha");
    await setupTestRepo(projectsRoot, "beta");
    templatePath = join(root, "workspace-CLAUDE.md");
    await writeFile(
      templatePath,
      "# {{feature_title}}\n\n{{#each projects}}- {{folder}}\n{{/each}}"
    );
    config = {
      workspacesDir,
      projectRoots: [projectsRoot],
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceClaudeMd: templatePath },
      setupScriptPaths: ["./setup.sh", ".workit/setup.sh"],
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("single-project: creates worktree, runs setup, no workspace folder", async () => {
    const result = await runNewCommand({
      config,
      description: "First feature",
      branchType: "feat",
      projectNames: ["alpha"],
      terminal: "none",
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    const wt = join(workspacesDir, "alpha.first-feature");
    expect(await pathExists(wt)).toBe(true);
    expect(await pathExists(join(wt, ".git"))).toBe(true);
    // setup output recorded
    expect(result.setupResults[0]!.status).toBe("ok");
  });

  test("multi-project: creates workspace + CLAUDE.md + per-project worktrees", async () => {
    const result = await runNewCommand({
      config,
      description: "Big Change",
      branchType: "feat",
      projectNames: ["alpha", "beta"],
      terminal: "none",
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    const ws = join(workspacesDir, "big-change");
    expect(await pathExists(ws)).toBe(true);
    const claudeMd = await readFile(join(ws, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("Big Change");
    expect(claudeMd).toContain("alpha.big-change");
    expect(claudeMd).toContain("beta.big-change");
    expect(await pathExists(join(ws, "alpha.big-change"))).toBe(true);
    expect(await pathExists(join(ws, "beta.big-change"))).toBe(true);
  });

  test("aborts when target folder already exists", async () => {
    await runNewCommand({
      config,
      description: "Thing",
      branchType: "feat",
      projectNames: ["alpha"],
      terminal: "none",
      assumeYes: true,
    });
    await expect(
      runNewCommand({
        config,
        description: "Thing",
        branchType: "feat",
        projectNames: ["alpha"],
        terminal: "none",
        assumeYes: true,
      })
    ).rejects.toThrow(/already exists/);
  });
});
```

- [ ] **Step 2: Implement `src/commands/new.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../core/config";
import { resolveConfigPaths } from "../core/config";
import { slugify } from "../core/slug";
import { buildNewPlan, formatNewPlan } from "../core/plan";
import { discoverProjects, type Project } from "../core/project-discovery";
import { ensureDir, pathExists } from "../utils/fs";
import { addWorktree } from "../git/worktree";
import { branchExists, isGitRepo } from "../git/repo";
import { runSetupScripts, type SetupResult } from "../setup/runner";
import { renderTemplate } from "../templates/render";
import {
  detectAvailability,
  dispatchBackend,
  selectBackend,
  type BackendName,
} from "../terminal";
import { colorFor, info, hint, warn, success } from "../ui/log";

export interface RunNewArgs {
  config: Config;
  description: string;
  branchType: string;
  projectNames: string[];
  terminal?: BackendName;
  assumeYes: boolean;
  dryRun?: boolean;
}

export interface RunNewResult {
  ok: boolean;
  plan: ReturnType<typeof buildNewPlan>;
  setupResults: SetupResult[];
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

export async function runNewCommand(args: RunNewArgs): Promise<RunNewResult> {
  const resolved = resolveConfigPaths(args.config);
  const slug = slugify(args.description);

  // Discover and match projects
  const all = await discoverProjects(resolved.resolvedProjectRoots);
  const matched: Project[] = [];
  for (const name of args.projectNames) {
    const p = all.find((x) => x.name === name);
    if (!p) throw new Error(`Project "${name}" not found under ${resolved.projectRoots.join(", ")}`);
    matched.push(p);
  }

  const plan = buildNewPlan({
    description: args.description,
    slug,
    branchType: args.branchType,
    projects: matched,
    workspacesDir: resolved.resolvedWorkspacesDir,
  });

  // Pre-flight
  for (const t of plan.targets) {
    if (!(await isGitRepo(t.project.path))) {
      throw new Error(`${t.project.name} is not a git repo at ${t.project.path}`);
    }
    if (await pathExists(t.targetPath)) {
      throw new Error(`Target already exists: ${t.targetPath}`);
    }
    if (await branchExists(t.project.path, t.branch)) {
      throw new Error(`Branch ${t.branch} already exists in ${t.project.name}`);
    }
  }

  info(formatNewPlan(plan));

  if (args.dryRun) {
    return { ok: true, plan, setupResults: [] };
  }

  // Create workspace folder + CLAUDE.md
  if (plan.isWorkspace && plan.workspacePath) {
    await ensureDir(plan.workspacePath);
    const tplPath = resolved.resolvedWorkspaceClaudeTemplate;
    if (await pathExists(tplPath)) {
      const tpl = await readFile(tplPath, "utf8");
      const rendered = renderTemplate(tpl, {
        feature_title: toTitleCase(args.description),
        feature_slug: slug,
        branch_type: args.branchType,
        branch_name: plan.targets[0]!.branch,
        projects: plan.targets.map((t) => ({
          name: t.project.name,
          folder: `${t.project.name}.${slug}`,
          branch: t.branch,
        })),
      });
      await writeFile(join(plan.workspacePath, "CLAUDE.md"), rendered);
    } else {
      warn(`template not found at ${tplPath}; skipping CLAUDE.md`);
    }
  }

  // Create worktrees in parallel
  await Promise.all(
    plan.targets.map((t) =>
      addWorktree({
        mainRepoPath: t.project.path,
        targetPath: t.targetPath,
        branch: t.branch,
      })
    )
  );

  // Run setup scripts in parallel
  const setupResults = await runSetupScripts({
    targets: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
    scriptPaths: resolved.setupScriptPaths,
    onLine: (name, line) => {
      const c = colorFor(name);
      console.log(c(`[${name}]`) + ` ${line}`);
    },
  });
  for (const r of setupResults) {
    if (r.status === "missing") {
      hint(`no setup script in ${r.name} — create one to automate this step`);
    } else if (r.status === "failed") {
      warn(`setup failed in ${r.name}: ${r.error ?? "unknown error"}`);
    } else {
      success(`${r.name} setup complete`);
    }
  }

  // Launch terminal
  const availability = await detectAvailability(args.config);
  const backend = selectBackend({
    flag: args.terminal,
    configDefault: args.config.defaultTerminal,
    insideTmux: availability.insideTmux,
    insideCmux: availability.insideCmux,
    tmuxAvailable: availability.tmuxAvailable,
    cmuxAvailable: availability.cmuxAvailable,
  });
  await dispatchBackend({
    backend,
    config: args.config,
    featureSlug: slug,
    workspacePath: plan.workspacePath,
    tabs: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
  });

  return { ok: true, plan, setupResults };
}
```

- [ ] **Step 3: Run integration test**

Run: `bun test tests/integration/new.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/new.ts tests/integration/new.test.ts
git commit -m "cmd: new — end-to-end flow + integration tests"
```

---

## Task 16: `workit rm` command + integration test

**Files:**
- Create: `src/commands/rm.ts`
- Create: `tests/integration/rm.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/integration/rm.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runNewCommand } from "../../src/commands/new";
import { runRmCommand } from "../../src/commands/rm";
import { pathExists } from "../../src/utils/fs";
import { branchExists } from "../../src/git/repo";
import type { Config } from "../../src/core/config";

async function makeRepo(parent: string, name: string) {
  const p = join(parent, name);
  await mkdir(p);
  await execa("git", ["init", "-q", "-b", "main", p]);
  await execa("git", ["config", "user.email", "t@t"], { cwd: p });
  await execa("git", ["config", "user.name", "t"], { cwd: p });
  await writeFile(join(p, "README.md"), "hi\n");
  await execa("git", ["add", "."], { cwd: p });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: p });
  return p;
}

describe("runRmCommand", () => {
  let root: string;
  let config: Config;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-rm-int-"));
    const projectsRoot = join(root, "projects");
    await mkdir(projectsRoot);
    await makeRepo(projectsRoot, "alpha");
    await makeRepo(projectsRoot, "beta");
    const tpl = join(root, "tpl.md");
    await writeFile(tpl, "# {{feature_title}}\n");
    config = {
      workspacesDir: join(root, "ws"),
      projectRoots: [projectsRoot],
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceClaudeMd: tpl },
      setupScriptPaths: ["./setup.sh"],
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("removes a single-project worktree by name", async () => {
    await runNewCommand({
      config,
      description: "Only Me",
      branchType: "feat",
      projectNames: ["alpha"],
      terminal: "none",
      assumeYes: true,
    });
    const wt = join(config.workspacesDir, "alpha.only-me");
    expect(await pathExists(wt)).toBe(true);

    const result = await runRmCommand({
      config,
      name: "alpha.only-me",
      deleteBranch: false,
      force: false,
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    expect(await pathExists(wt)).toBe(false);
    // branch preserved by default
    const projAlpha = join(root, "projects", "alpha");
    expect(await branchExists(projAlpha, "feat/only-me")).toBe(true);
  });

  test("removes an entire workspace and its worktrees", async () => {
    await runNewCommand({
      config,
      description: "Big Thing",
      branchType: "feat",
      projectNames: ["alpha", "beta"],
      terminal: "none",
      assumeYes: true,
    });
    const ws = join(config.workspacesDir, "big-thing");
    expect(await pathExists(ws)).toBe(true);

    const result = await runRmCommand({
      config,
      name: "big-thing",
      deleteBranch: true,
      force: false,
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    expect(await pathExists(ws)).toBe(false);
    const projAlpha = join(root, "projects", "alpha");
    const projBeta = join(root, "projects", "beta");
    expect(await branchExists(projAlpha, "feat/big-thing")).toBe(false);
    expect(await branchExists(projBeta, "feat/big-thing")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `src/commands/rm.ts`**

```typescript
import { readdir, rm as rmFs } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Config } from "../core/config";
import { resolveConfigPaths } from "../core/config";
import {
  buildRmPlan,
  formatRmPlan,
  type WorkspaceEntry,
  type WorktreeTarget,
} from "../core/plan";
import { discoverProjects, type Project } from "../core/project-discovery";
import { ensureDir, pathExists } from "../utils/fs";
import { removeWorktree } from "../git/worktree";
import {
  deleteBranch,
  isDirty,
  hasUnpushedCommits,
} from "../git/repo";
import { info, warn, success } from "../ui/log";

export interface RunRmArgs {
  config: Config;
  name: string;
  deleteBranch: boolean;
  force: boolean;
  assumeYes: boolean;
  dryRun?: boolean;
}

export interface RunRmResult {
  ok: boolean;
}

/**
 * Resolve a worktree folder name (`project.slug`) to its originating project
 * and branch by reading git metadata from the worktree itself.
 */
async function resolveWorktreeTarget(
  path: string,
  projects: Project[]
): Promise<WorktreeTarget | null> {
  if (!(await pathExists(join(path, ".git")))) return null;
  const { execa } = await import("execa");
  const commonDir = await execa(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: path, reject: false }
  );
  if (commonDir.exitCode !== 0) return null;
  // common dir looks like /.../<project>/.git → parent is the main repo
  const mainRepo = resolve(commonDir.stdout.trim(), "..");
  const project = projects.find((p) => resolve(p.path) === mainRepo);
  if (!project) return null;
  const branchRes = await execa(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: path, reject: false }
  );
  const branch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : "HEAD";
  return { project, branch, targetPath: path };
}

async function loadEntries(
  workspacesDir: string,
  projects: Project[]
): Promise<WorkspaceEntry[]> {
  if (!(await pathExists(workspacesDir))) return [];
  const entries: WorkspaceEntry[] = [];
  const children = await readdir(workspacesDir, { withFileTypes: true });
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const full = join(workspacesDir, c.name);
    // Heuristic: if it has a .git inside, it's a single worktree. Otherwise treat as workspace.
    if (await pathExists(join(full, ".git"))) {
      const target = await resolveWorktreeTarget(full, projects);
      if (target) entries.push({ kind: "single", path: full, target });
      continue;
    }
    // workspace: look at subdirs
    const subs = await readdir(full, { withFileTypes: true });
    const worktrees: WorktreeTarget[] = [];
    for (const s of subs) {
      if (!s.isDirectory()) continue;
      const sub = join(full, s.name);
      const target = await resolveWorktreeTarget(sub, projects);
      if (target) worktrees.push(target);
    }
    if (worktrees.length > 0) {
      entries.push({ kind: "workspace", slug: c.name, path: full, worktrees });
    }
  }
  return entries;
}

export async function runRmCommand(args: RunRmArgs): Promise<RunRmResult> {
  const resolved = resolveConfigPaths(args.config);
  await ensureDir(resolved.resolvedWorkspacesDir);
  const projects = await discoverProjects(resolved.resolvedProjectRoots);
  const entries = await loadEntries(resolved.resolvedWorkspacesDir, projects);
  const plan = buildRmPlan({
    name: args.name,
    workspacesDir: resolved.resolvedWorkspacesDir,
    entries,
  });

  info(formatRmPlan(plan));

  if (args.dryRun) return { ok: true };

  // Pre-checks per worktree
  if (!args.force) {
    for (const t of plan.targets) {
      if (await isDirty(t.targetPath)) {
        throw new Error(
          `${t.project.name} worktree is dirty — commit/stash or pass --force`
        );
      }
      if (await hasUnpushedCommits(t.targetPath, t.branch)) {
        warn(`${t.project.name} has unpushed commits on ${t.branch}`);
      }
    }
  }

  // Remove worktrees
  for (const t of plan.targets) {
    await removeWorktree({
      mainRepoPath: t.project.path,
      targetPath: t.targetPath,
      force: args.force,
    });
    success(`removed ${t.targetPath}`);
  }

  // Delete branches (opt-in)
  if (args.deleteBranch) {
    for (const t of plan.targets) {
      try {
        await deleteBranch(t.project.path, t.branch);
        success(`deleted branch ${t.branch} in ${t.project.name}`);
      } catch (err: any) {
        warn(`could not delete ${t.branch}: ${err.shortMessage ?? err}`);
      }
    }
  }

  // Remove workspace folder if it was a workspace
  if (plan.kind === "workspace" && plan.workspacePath) {
    await rmFs(plan.workspacePath, { recursive: true, force: true });
    success(`removed workspace folder ${plan.workspacePath}`);
  }

  return { ok: true };
}
```

- [ ] **Step 3: Run integration test**

Run: `bun test tests/integration/rm.test.ts`
Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/rm.ts tests/integration/rm.test.ts
git commit -m "cmd: rm — removes worktrees, workspaces, optional branch delete"
```

---

## Task 17: `workit ls` and `workit config`

**Files:**
- Create: `src/commands/ls.ts`
- Create: `src/commands/config.ts`
- Test: `tests/unit/commands/ls.test.ts`

- [ ] **Step 1: Implement `src/commands/ls.ts`**

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../core/config";
import { resolveConfigPaths } from "../core/config";
import { pathExists } from "../utils/fs";
import { info } from "../ui/log";

export interface ListEntry {
  kind: "workspace" | "single";
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
    const kind = (await pathExists(join(full, ".git"))) ? "single" : "workspace";
    out.push({ kind, name: c.name, path: full });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function runLsCommand(config: Config): Promise<void> {
  const entries = await listEntries(config);
  if (entries.length === 0) {
    info("No worktrees or workspaces found.");
    return;
  }
  for (const e of entries) {
    const tag = e.kind === "workspace" ? "[workspace]" : "[worktree] ";
    console.log(`${tag} ${e.name}  ${e.path}`);
  }
}
```

- [ ] **Step 2: Implement `src/commands/config.ts`**

```typescript
import { loadConfig } from "../core/config";
import { info, success } from "../ui/log";

export async function runConfigCommand(): Promise<void> {
  const { config, created, path } = await loadConfig();
  if (created) {
    success(`wrote default config to ${path}`);
  } else {
    info(`config: ${path}`);
  }
  console.log(JSON.stringify(config, null, 2));
}
```

- [ ] **Step 3: Write unit test for `listEntries`**

Create `tests/unit/commands/ls.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listEntries } from "../../../src/commands/ls";
import type { Config } from "../../../src/core/config";

describe("listEntries", () => {
  let root: string;
  let config: Config;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-ls-"));
    config = {
      workspacesDir: root,
      projectRoots: ["/"],
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceClaudeMd: "/x" },
      setupScriptPaths: ["./setup.sh"],
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("labels single worktrees and workspaces", async () => {
    await mkdir(join(root, "single.slug"));
    await mkdir(join(root, "single.slug/.git"));
    await writeFile(join(root, "single.slug/.git/HEAD"), "ref: refs/heads/main\n");
    await mkdir(join(root, "workspace-feat"));
    await mkdir(join(root, "workspace-feat/subA"));

    const entries = await listEntries(config);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.kind]));
    expect(byName["single.slug"]).toBe("single");
    expect(byName["workspace-feat"]).toBe("workspace");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/unit/commands/`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/ls.ts src/commands/config.ts tests/unit/commands/
git commit -m "cmd: ls and config"
```

---

## Task 18: CLI entry point with commander

**Files:**
- Modify: `src/cli.ts` (replace placeholder)

- [ ] **Step 1: Replace `src/cli.ts` with the real entry**

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { loadConfig } from "./core/config";
import { runNewCommand } from "./commands/new";
import { runRmCommand } from "./commands/rm";
import { runLsCommand } from "./commands/ls";
import { runConfigCommand } from "./commands/config";
import { discoverProjects, findProjectContaining } from "./core/project-discovery";
import { resolveConfigPaths } from "./core/config";
import {
  promptDescription,
  promptBranchType,
  promptProjectPicker,
  promptConfirm,
} from "./ui/prompts";
import { error } from "./ui/log";
import type { BackendName } from "./terminal";

const program = new Command();
program.name("workit").description("Multi-project git worktree workflow manager").version("0.1.0");

program
  .command("new")
  .description("Create worktree(s) for a new feature")
  .argument("[description]", "feature description")
  .option("--type <type>", "branch type (feat/fix/chore/...)")
  .option("--projects <names>", "comma-separated project names")
  .option("--terminal <backend>", "cmux|tmux|none")
  .option("--dry-run", "print the plan without executing", false)
  .option("-y, --yes", "skip confirmations", false)
  .action(async (description: string | undefined, opts) => {
    try {
      const { config } = await loadConfig();
      const resolved = resolveConfigPaths(config);
      const all = await discoverProjects(resolved.resolvedProjectRoots);

      const desc = await promptDescription(description);
      const branchType = await promptBranchType(opts.type, config.defaultBranchType);

      let projectNames: string[];
      if (opts.projects) {
        projectNames = String(opts.projects).split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        const pre = findProjectContaining(all, process.cwd());
        const picked = await promptProjectPicker(all, pre ? [pre] : []);
        projectNames = picked.map((p) => p.name);
      }

      if (!opts.yes && !opts.dryRun) {
        const go = await promptConfirm("Proceed?", true);
        if (!go) return;
      }

      await runNewCommand({
        config,
        description: desc,
        branchType,
        projectNames,
        terminal: opts.terminal as BackendName | undefined,
        assumeYes: Boolean(opts.yes),
        dryRun: Boolean(opts.dryRun),
      });
    } catch (e: any) {
      error(e.message ?? String(e));
      process.exit(1);
    }
  });

program
  .command("rm")
  .description("Remove a worktree or workspace")
  .argument("[name]", "workspace or worktree name")
  .option("--delete-branch", "also delete the git branch", false)
  .option("--force", "skip dirty/unpushed checks", false)
  .option("--dry-run", "print the plan without executing", false)
  .option("-y, --yes", "skip confirmation", false)
  .action(async (name: string | undefined, opts) => {
    try {
      if (!name) {
        error("missing name argument (interactive picker not yet implemented)");
        process.exit(1);
      }
      const { config } = await loadConfig();
      if (!opts.yes && !opts.dryRun) {
        const ok = await promptConfirm(`Remove "${name}"?`, false);
        if (!ok) return;
      }
      await runRmCommand({
        config,
        name,
        deleteBranch: Boolean(opts.deleteBranch),
        force: Boolean(opts.force),
        assumeYes: Boolean(opts.yes),
        dryRun: Boolean(opts.dryRun),
      });
    } catch (e: any) {
      error(e.message ?? String(e));
      process.exit(1);
    }
  });

program
  .command("ls")
  .description("List worktrees and workspaces")
  .action(async () => {
    const { config } = await loadConfig();
    await runLsCommand(config);
  });

program
  .command("config")
  .description("Print config (creates default if missing)")
  .action(async () => {
    await runConfigCommand();
  });

program.parseAsync(process.argv);
```

- [ ] **Step 2: Smoke run**

Run: `bun run src/cli.ts --help`
Expected: help output listing `new`, `rm`, `ls`, `config`.

Run: `bun run src/cli.ts config`
Expected: prints the default config (creates `~/.config/workit/config.json` if missing). **Warning:** this writes to the user's real config path — safe to run once, it backs nothing up. If you want to avoid touching the real config, temporarily set `HOME` to a scratch dir.

- [ ] **Step 3: Full test suite**

Run: `bun test`
Expected: all unit + integration tests pass.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "cli: wire up commander entry point for new/rm/ls/config"
```

---

## Task 19: Build scripts and distribution readiness

**Files:**
- Modify: `package.json` (already has scripts from Task 1 — just verify)
- Modify: `README.md` (document install paths)

- [ ] **Step 1: Run the npm build target**

Run: `bun run build:npm`
Expected: `dist/cli.js` exists, starts with `#!/usr/bin/env node`. Running `node dist/cli.js --help` prints help.

- [ ] **Step 2: Run the binary build target**

Run: `bun run build:binary`
Expected: `dist/workit` executable file. Running `./dist/workit --help` prints help.

- [ ] **Step 3: Update `README.md`**

Replace `README.md` with:

```markdown
# workit

CLI workflow manager for multi-project git worktrees.

## Install

### From source (Bun)

```bash
bun install
bun run dev -- new
```

### npm (global)

```bash
npm install -g workit
```

### Homebrew (tap)

```bash
brew install <your-tap>/workit
```

## Usage

```bash
workit new "Add DAC7 reporting"
workit new "Fix header bug" --type fix --projects storelink-dashboard
workit ls
workit rm add-dac7-reporting --delete-branch
workit config
```

## Design

See `docs/specs/2026-04-12-workit-design.md` and `docs/plans/2026-04-12-workit-implementation.md`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with install/usage"
```

---

## Self-review checklist

Before marking this plan complete, verify:

- [ ] Every spec section from `docs/specs/2026-04-12-workit-design.md` is implemented by at least one task
- [ ] No `TBD` / `TODO` / "implement later" / "add error handling" placeholders remain
- [ ] Type names and function signatures used in later tasks match their definitions
- [ ] Every task either runs tests or is explicitly non-test (scaffolding, docs)
- [ ] Every commit message is spelled out

**Coverage map (spec section → task):**

| Spec section | Task(s) |
|---|---|
| Commands: `new`, `rm`, `ls`, `config` | 15, 16, 17 |
| Directory layout (`~/.workit/workspaces/`) | 4 (config default), 14 (plan builder) |
| Config file shape + loader | 4 |
| Workspace `CLAUDE.md` template | 5, 15 |
| Project discovery + cache | 7 |
| Pre-flight checks | 15 |
| Worktree creation (parallel, from main repo) | 6, 15 |
| Setup runner (parallel, prefixed output) | 8, 15 |
| Terminal backends (cmux/tmux/none) | 9–12, 15 |
| `rm` flow (dirty check, branch delete, workspace rm) | 16 |
| Dry-run | 15 (new), 16 (rm) |
| Error handling (no rollback, clear summary) | 15, 16 |
| Bun build + npm + Homebrew | 1, 19 |
| Tests (unit + integration) | every task with behavior |

All items accounted for.
