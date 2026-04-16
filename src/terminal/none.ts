import pc from 'picocolors';

export interface TabSpec {
  name: string;
  cwd: string;
}

export interface NoneBackendArgs {
  workspacePath: string | null;
  tabs: TabSpec[];
}

export function formatNoneBackendOutput(args: NoneBackendArgs): string {
  const lines: string[] = [pc.bold('Created worktrees:')];
  const width = Math.max(...args.tabs.map((t) => t.name.length));
  for (const tab of args.tabs) {
    const label = `[${tab.name}]`.padEnd(width + 3);
    lines.push(`  ${pc.cyan(label)} ${tab.cwd}`);
  }
  lines.push('');
  const cdTarget = args.workspacePath ?? args.tabs[0]!.cwd;
  lines.push(`${pc.bold('Next:')} cd ${cdTarget}`);
  return lines.join('\n');
}

export function runNoneBackend(args: NoneBackendArgs): void {
  console.log(formatNoneBackendOutput(args));
}
