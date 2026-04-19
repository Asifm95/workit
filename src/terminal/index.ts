import type { Config } from '../core/config';
import { runNoneBackend, type TabSpec } from './none';
import { runTmuxBackend, tmuxInstalled, insideTmux } from './tmux';
import { runCmuxBackend, cmuxInstalled, insideCmux } from './cmux';
import { runWarpBackend, warpInstalled, insideWarp } from './warp';

export type BackendName = 'cmux' | 'tmux' | 'warp' | 'none';

export interface SelectBackendArgs {
  flag?: BackendName;
  configDefault: Config['defaultTerminal'];
  insideTmux: boolean;
  insideCmux: boolean;
  insideWarp: boolean;
  tmuxAvailable: boolean;
  cmuxAvailable: boolean;
  warpAvailable: boolean;
}

export function selectBackend(args: SelectBackendArgs): BackendName {
  if (args.flag) return args.flag;
  if (args.insideCmux && args.cmuxAvailable) return 'cmux';
  if (args.insideTmux && args.tmuxAvailable) return 'tmux';
  if (args.insideWarp && args.warpAvailable) return 'warp';
  if (args.configDefault !== 'auto') {
    const d = args.configDefault;
    if (d === 'cmux' && args.cmuxAvailable) return 'cmux';
    if (d === 'tmux' && args.tmuxAvailable) return 'tmux';
    if (d === 'warp' && args.warpAvailable) return 'warp';
    if (d === 'none') return 'none';
  }
  if (args.tmuxAvailable) return 'tmux';
  if (args.cmuxAvailable) return 'cmux';
  return 'none';
}

export interface DispatchArgs {
  backend: BackendName;
  config: Config;
  workspaceName: string;
  workspacePath: string | null;
  tabs: TabSpec[];
}

export async function dispatchBackend(args: DispatchArgs): Promise<void> {
  const { backend, config, workspaceName, workspacePath, tabs } = args;
  switch (backend) {
    case 'none':
      runNoneBackend({ workspacePath, tabs });
      return;
    case 'tmux':
      await runTmuxBackend({ workspaceName, tabs });
      return;
    case 'cmux': {
      const binary = config.terminalCommand.cmux ?? 'cmux';
      await runCmuxBackend({ binary, workspaceName, tabs });
      return;
    }
    case 'warp':
      await runWarpBackend({ workspaceName, tabs });
      return;
  }
}

export interface DetectAvailabilityResult {
  tmuxAvailable: boolean;
  cmuxAvailable: boolean;
  warpAvailable: boolean;
  insideTmux: boolean;
  insideCmux: boolean;
  insideWarp: boolean;
}

export async function detectAvailability(config: Config): Promise<DetectAvailabilityResult> {
  const cmuxBinary = config.terminalCommand.cmux ?? 'cmux';
  const [tmux, cmux, warp] = await Promise.all([
    tmuxInstalled(),
    cmuxInstalled(cmuxBinary),
    warpInstalled(),
  ]);
  return {
    tmuxAvailable: tmux,
    cmuxAvailable: cmux,
    warpAvailable: warp,
    insideTmux: insideTmux(),
    insideCmux: insideCmux(),
    insideWarp: insideWarp(),
  };
}
