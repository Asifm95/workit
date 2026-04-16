import type { Config } from '../core/config';
import { runNoneBackend, type TabSpec } from './none';
import { runTmuxBackend, tmuxInstalled, insideTmux } from './tmux';
import { runCmuxBackend, cmuxInstalled, insideCmux } from './cmux';

export type BackendName = 'cmux' | 'tmux' | 'none';

export interface SelectBackendArgs {
  flag?: BackendName;
  configDefault: Config['defaultTerminal'];
  insideTmux: boolean;
  insideCmux: boolean;
  tmuxAvailable: boolean;
  cmuxAvailable: boolean;
}

export function selectBackend(args: SelectBackendArgs): BackendName {
  if (args.flag) return args.flag;
  if (args.insideCmux && args.cmuxAvailable) return 'cmux';
  if (args.insideTmux && args.tmuxAvailable) return 'tmux';
  if (args.configDefault !== 'auto') {
    const d = args.configDefault;
    if (d === 'cmux' && args.cmuxAvailable) return 'cmux';
    if (d === 'tmux' && args.tmuxAvailable) return 'tmux';
    if (d === 'none') return 'none';
  }
  if (args.tmuxAvailable) return 'tmux';
  if (args.cmuxAvailable) return 'cmux';
  return 'none';
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
    case 'none':
      runNoneBackend({ workspacePath, tabs });
      return;
    case 'tmux':
      await runTmuxBackend({ featureSlug, tabs });
      return;
    case 'cmux': {
      const binary = config.terminalCommand.cmux ?? 'cmux';
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

export async function detectAvailability(config: Config): Promise<DetectAvailabilityResult> {
  const cmuxBinary = config.terminalCommand.cmux ?? 'cmux';
  const [tmux, cmux] = await Promise.all([tmuxInstalled(), cmuxInstalled(cmuxBinary)]);
  return {
    tmuxAvailable: tmux,
    cmuxAvailable: cmux,
    insideTmux: insideTmux(),
    insideCmux: insideCmux(),
  };
}
