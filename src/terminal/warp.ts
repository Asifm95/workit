import { execa } from 'execa';
import { mkdir } from 'node:fs/promises';
import path, { join } from 'node:path';
import { pathExists } from '../utils/fs';
import { warn } from '../ui/log';
import type { TabSpec } from './none';

export function insideWarp(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM === 'WarpTerminal';
}

export async function warpInstalled(
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (platform === 'darwin') {
    return pathExists('/Applications/Warp.app');
  }
  if (platform === 'linux') {
    const r = await execa('which', ['warp-terminal'], { reject: false });
    return r.exitCode === 0;
  }
  return false;
}

export function launchConfigurationsDir(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === 'darwin') {
    return join(env.HOME ?? '', '.warp', 'launch_configurations');
  }
  if (platform === 'win32') {
    return path.win32.join(
      env.APPDATA ?? '',
      'warp',
      'Warp',
      'data',
      'launch_configurations',
    );
  }
  const xdg = env.XDG_DATA_HOME && env.XDG_DATA_HOME.length > 0
    ? env.XDG_DATA_HOME
    : join(env.HOME ?? '', '.local', 'share');
  return join(xdg, 'warp-terminal', 'launch_configurations');
}

export interface BuildWarpArgs {
  configName: string;
  tabs: TabSpec[];
}

export function buildWarpLaunchConfig(args: BuildWarpArgs): string {
  const lines: string[] = ['---', `name: ${yamlString(args.configName)}`, 'windows:', '  - tabs:'];
  for (const tab of args.tabs) {
    lines.push(`      - title: ${yamlString(tab.name)}`);
    lines.push('        layout:');
    lines.push(`          cwd: ${yamlString(tab.cwd)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function yamlString(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface RunWarpArgs {
  featureSlug: string;
  tabs: TabSpec[];
}

export async function runWarpBackend(args: RunWarpArgs): Promise<void> {
  const { featureSlug, tabs } = args;
  if (tabs.length === 0) return;

  if (!(await warpInstalled())) {
    throw new Error(
      'Warp is not available on this system (install from https://warp.dev or pick a different --terminal backend)',
    );
  }

  const dir = launchConfigurationsDir(process.platform, process.env);
  const filePath = join(dir, `${featureSlug}.yaml`);
  const yaml = buildWarpLaunchConfig({ configName: featureSlug, tabs });

  await mkdir(dir, { recursive: true });
  await Bun.write(filePath, yaml);

  const url = `warp://launch/${featureSlug}`;
  const invocation = deepLinkCommand(process.platform, url);
  if (!invocation) {
    warn(`Warp deep-link not supported on ${process.platform}; open manually: ${filePath}`);
    return;
  }

  const r = await execa(invocation.cmd, invocation.args, { reject: false });
  if (r.exitCode !== 0) {
    warn(`Could not open Warp via ${url}. Launch it manually from Warp; YAML at ${filePath}`);
  }
}

function deepLinkCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } | null {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'linux') return { cmd: 'xdg-open', args: [url] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  return null;
}
