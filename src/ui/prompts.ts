import * as p from '@clack/prompts';
import type { Project } from '../core/project-discovery';
import type { BackendName } from '../terminal';
import { directoryPicker } from './directory-picker';
import { warn } from './log';

export async function promptDescription(initial?: string): Promise<string> {
  if (initial) return initial;
  const result = await p.text({
    message: 'Feature description',
    placeholder: 'Add DAC7 reporting',
    validate: (v) => (v.trim().length === 0 ? 'required' : undefined),
  });
  if (p.isCancel(result)) {
    p.cancel('Cancelled');
    process.exit(1);
  }
  return result as string;
}

export async function promptBranchType(
  initial: string | undefined,
  defaultValue: string,
): Promise<string> {
  if (initial) return initial;
  const result = await p.select({
    message: 'Branch type',
    initialValue: defaultValue,
    options: [
      { value: 'feat', label: 'feat' },
      { value: 'fix', label: 'fix' },
      { value: 'chore', label: 'chore' },
      { value: 'ref', label: 'ref' },
      { value: 'docs', label: 'docs' },
      { value: 'test', label: 'test' },
    ],
  });
  if (p.isCancel(result)) {
    p.cancel('Cancelled');
    process.exit(1);
  }
  return result as string;
}

export async function promptProjectPicker(cwd: string): Promise<Project[]> {
  return directoryPicker({ cwd });
}

export interface ShellAvailability {
  cmuxAvailable: boolean;
  tmuxAvailable: boolean;
  insideCmux: boolean;
  insideTmux: boolean;
}

export function computeShellDefault(a: ShellAvailability): BackendName {
  if (a.insideCmux && a.cmuxAvailable) return 'cmux';
  if (a.tmuxAvailable) return 'tmux';
  if (a.cmuxAvailable) return 'cmux';
  return 'none';
}

export async function promptShell(a: ShellAvailability): Promise<BackendName> {
  const options = [
    {
      value: 'cmux' as const,
      label: 'cmux',
      hint: a.cmuxAvailable ? (a.insideCmux ? 'current session' : undefined) : 'not installed',
    },
    {
      value: 'tmux' as const,
      label: 'tmux',
      hint: a.tmuxAvailable ? (a.insideTmux ? 'current session' : undefined) : 'not installed',
    },
    {
      value: 'none' as const,
      label: 'none',
      hint: 'skip multiplexer',
    },
  ];
  const initialValue = computeShellDefault(a);

  while (true) {
    const result = await p.select({ message: 'Terminal', initialValue, options });
    if (p.isCancel(result)) {
      p.cancel('Cancelled');
      process.exit(1);
    }
    const chosen = result as BackendName;
    if (chosen === 'cmux' && !a.cmuxAvailable) {
      warn('cmux is not installed');
      continue;
    }
    if (chosen === 'tmux' && !a.tmuxAvailable) {
      warn('tmux is not installed');
      continue;
    }
    return chosen;
  }
}

export async function promptConfirm(message: string, initialValue = true): Promise<boolean> {
  const result = await p.confirm({ message, initialValue });
  if (p.isCancel(result)) {
    p.cancel('Cancelled');
    process.exit(1);
  }
  return result as boolean;
}

export const prompts = p;
