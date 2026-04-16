import * as p from "@clack/prompts";
import type { Project } from "../core/project-discovery";

export async function promptDescription(
  initial?: string
): Promise<string> {
  if (initial) return initial;
  const result = await p.text({
    message: "Feature description",
    placeholder: "Add DAC7 reporting",
    validate: (v) => (v.trim().length === 0 ? "required" : undefined),
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as string;
}

export async function promptBranchType(
  initial: string | undefined,
  defaultValue: string
): Promise<string> {
  if (initial) return initial;
  const result = await p.select({
    message: "Branch type",
    initialValue: defaultValue,
    options: [
      { value: "feat", label: "feat" },
      { value: "fix", label: "fix" },
      { value: "chore", label: "chore" },
      { value: "ref", label: "ref" },
      { value: "docs", label: "docs" },
      { value: "test", label: "test" },
    ],
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as string;
}

export async function promptProjectPicker(
  _cwd: string,
): Promise<Project[]> {
  // TODO: Replace with DirectoryPicker in Phase 2
  throw new Error("Interactive project picker not yet implemented");
}

export async function promptConfirm(
  message: string,
  initialValue = true
): Promise<boolean> {
  const result = await p.confirm({ message, initialValue });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return result as boolean;
}

export const prompts = p;
