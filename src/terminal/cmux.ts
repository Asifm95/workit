import { execa } from 'execa';
import { pathExists } from '../utils/fs';
import type { TabSpec } from './none';

export interface CmuxPlanStep {
  kind: 'new-workspace' | 'rename-first-tab' | 'new-surface' | 'send-cd' | 'rename-tab';
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
    kind: 'new-workspace',
    args: ['new-workspace', '--name', workspaceName, '--cwd', first.cwd],
  });
  plan.push({
    kind: 'rename-first-tab',
    args: ['rename-tab', '--workspace', '{{workspace}}', '--surface', '{{first}}', first.name],
  });
  for (const tab of rest) {
    plan.push({
      kind: 'new-surface',
      args: ['new-surface', '--type', 'terminal', '--workspace', '{{workspace}}'],
      tab,
    });
  }
  return plan;
}

export async function cmuxInstalled(binary: string): Promise<boolean> {
  if (!(await pathExists(binary))) return false;
  try {
    await execa(binary, ['--help'], { reject: false });
    return true;
  } catch {
    return false;
  }
}

export function insideCmux(): boolean {
  return (
    typeof process.env.CMUX_WORKSPACE_ID === 'string' && process.env.CMUX_WORKSPACE_ID.length > 0
  );
}

export interface RunCmuxArgs {
  binary: string;
  workspaceName: string;
  tabs: TabSpec[];
}

export function parseRef(stdout: string, kind: 'workspace' | 'surface' | 'pane'): string | undefined {
  const prefix = `${kind}:`;
  for (const token of stdout.trim().split(/\s+/)) {
    if (token.startsWith(prefix)) return token;
  }
  return undefined;
}

export async function runCmuxBackend(args: RunCmuxArgs): Promise<void> {
  const { binary, workspaceName, tabs } = args;
  const [first, ...rest] = tabs;
  if (!first) return;

  const createRes = await execa(
    binary,
    ['new-workspace', '--name', workspaceName, '--cwd', first.cwd],
    { reject: true },
  );
  const workspace = parseRef(String(createRes.stdout ?? ''), 'workspace');
  if (!workspace) {
    throw new Error(`cmux new-workspace did not return a workspace ref: ${createRes.stdout}`);
  }

  const firstSurfaceRes = await execa(
    binary,
    ['list-pane-surfaces', '--workspace', workspace],
    { reject: false },
  );
  const firstSurface =
    firstSurfaceRes.exitCode === 0
      ? parseRef(String(firstSurfaceRes.stdout ?? ''), 'surface') ?? 'surface:1'
      : 'surface:1';

  await execa(
    binary,
    ['rename-tab', '--workspace', workspace, '--surface', firstSurface, first.name],
    { reject: false },
  );

  for (const tab of rest) {
    const surfRes = await execa(
      binary,
      ['new-surface', '--type', 'terminal', '--workspace', workspace],
      { reject: true },
    );
    const surface = parseRef(String(surfRes.stdout ?? ''), 'surface');
    if (!surface) {
      throw new Error(`cmux new-surface did not return a surface ref: ${surfRes.stdout}`);
    }
    await execa(
      binary,
      ['send', '--workspace', workspace, '--surface', surface, `cd ${tab.cwd}\n`],
      { reject: true },
    );
    await execa(binary, ['rename-tab', '--workspace', workspace, '--surface', surface, tab.name], {
      reject: false,
    });
  }
}
