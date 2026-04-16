import { execa, execaSync } from 'execa';
import type { TabSpec } from './none';

export function sanitizeSessionName(name: string): string {
  return name.replace(/[.:]/g, '-');
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
  cmds.push(['new-session', '-d', '-s', sessionName, '-n', first.name, '-c', first.cwd]);
  for (const tab of rest) {
    cmds.push(['new-window', '-t', `${sessionName}:`, '-n', tab.name, '-c', tab.cwd]);
  }
  return cmds;
}

export async function tmuxInstalled(): Promise<boolean> {
  try {
    await execa('tmux', ['-V']);
    return true;
  } catch {
    return false;
  }
}

export function insideTmux(): boolean {
  return typeof process.env.TMUX === 'string' && process.env.TMUX.length > 0;
}

async function sessionExists(name: string): Promise<boolean> {
  const r = await execa('tmux', ['has-session', `-t=${name}`], { reject: false });
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
      await execa('tmux', cmd, { reject: true });
    }
  }

  if (insideTmux()) {
    await execa('tmux', ['switch-client', '-t', sessionName], { reject: true });
    return;
  }

  if (process.stdin.isTTY) {
    execaSync('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' });
  } else {
    console.log(`tmux session ready: ${sessionName}`);
    console.log(`Attach with: tmux attach -t ${sessionName}`);
  }
}
