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
