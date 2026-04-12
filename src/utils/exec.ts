import { execa, type Options } from "execa";

export type ExecOptions = Options;

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(
  file: string,
  args: readonly string[],
  options: ExecOptions & { reject?: boolean } = {}
): Promise<ExecResult> {
  const result = await execa(file, args, {
    reject: true,
    ...options,
  } as Options);
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: result.exitCode ?? 1,
  };
}

export async function runCapture(
  file: string,
  args: readonly string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const result = await execa(file, args, { reject: true, ...options });
  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: result.exitCode ?? 0,
  };
}
