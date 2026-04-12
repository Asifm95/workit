import { execa } from "execa";

async function gitOk(cwd: string, args: string[]): Promise<boolean> {
  const r = await execa("git", args, { cwd, reject: false });
  return r.exitCode === 0;
}

async function gitOut(cwd: string, args: string[]): Promise<string> {
  const r = await execa("git", args, { cwd, reject: true });
  return String(r.stdout ?? "").trim();
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return gitOk(cwd, ["rev-parse", "--is-inside-work-tree"]);
}

export async function currentBranch(cwd: string): Promise<string> {
  return gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function branchExists(cwd: string, name: string): Promise<boolean> {
  return gitOk(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
}

export async function isDirty(cwd: string): Promise<boolean> {
  const out = await gitOut(cwd, ["status", "--porcelain"]);
  return out.length > 0;
}

export async function hasUnpushedCommits(cwd: string, branch: string): Promise<boolean> {
  const upstream = await execa(
    "git",
    ["rev-parse", "--abbrev-ref", `${branch}@{u}`],
    { cwd, reject: false }
  );
  if (upstream.exitCode !== 0) return false;
  const ahead = await gitOut(cwd, [
    "rev-list",
    "--count",
    `${String(upstream.stdout ?? "").trim()}..${branch}`,
  ]);
  return Number(ahead) > 0;
}

export async function deleteBranch(cwd: string, name: string): Promise<void> {
  await execa("git", ["branch", "-D", name], { cwd, reject: true });
}

export async function mainWorktreePath(cwd: string): Promise<string> {
  const out = await gitOut(cwd, ["worktree", "list", "--porcelain"]);
  const first = out.split("\n\n")[0]!;
  const line = first.split("\n").find((l) => l.startsWith("worktree "))!;
  return line.slice("worktree ".length);
}
