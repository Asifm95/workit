import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

export async function makeRepo(prefix = "workit-repo-"): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  await execa("git", ["init", "-q", "-b", "main"], { cwd: path });
  await execa("git", ["config", "user.email", "t@t"], { cwd: path });
  await execa("git", ["config", "user.name", "t"], { cwd: path });
  await writeFile(join(path, "README.md"), "hi\n");
  await execa("git", ["add", "."], { cwd: path, env });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: path, env });
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
