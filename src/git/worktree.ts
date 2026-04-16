import { execa } from 'execa';

export interface AddWorktreeArgs {
  mainRepoPath: string;
  targetPath: string;
  branch: string;
  reuseExistingBranch?: boolean;
}

export async function addWorktree(args: AddWorktreeArgs): Promise<void> {
  const { mainRepoPath, targetPath, branch, reuseExistingBranch } = args;
  const cmd = reuseExistingBranch
    ? ['worktree', 'add', targetPath, branch]
    : ['worktree', 'add', targetPath, '-b', branch];
  await execa('git', cmd, { cwd: mainRepoPath, reject: true });
}

export interface RemoveWorktreeArgs {
  mainRepoPath: string;
  targetPath: string;
}

export async function removeWorktree(args: RemoveWorktreeArgs): Promise<void> {
  const { mainRepoPath, targetPath } = args;
  // Always double --force: the rm command handles its own dirty/unpushed
  // checks, and double-force is required for worktrees with submodules.
  await execa('git', ['worktree', 'remove', '--force', '--force', targetPath], {
    cwd: mainRepoPath,
    reject: true,
  });
}
