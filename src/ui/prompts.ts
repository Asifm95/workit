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
  projects: Project[],
  preselected: Project[]
): Promise<Project[]> {
  const result = await p.multiselect({
    message: "Select projects",
    required: true,
    initialValues: preselected.map((proj) => proj.path),
    options: projects.map((proj) => ({ value: proj.path, label: proj.name })),
  });
  if (p.isCancel(result)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  const picks = result as string[];
  return picks
    .map((path) => projects.find((proj) => proj.path === path)!)
    .filter(Boolean);
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
