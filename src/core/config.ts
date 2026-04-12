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
  let raw: unknown;
  try {
    raw = await readJsonFile(path);
  } catch (err) {
    throw new Error(`Invalid config at ${path}: ${(err as Error).message}`);
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid config at ${path}: ${issues}`);
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
