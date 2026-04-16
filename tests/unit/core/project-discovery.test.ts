import { describe, expect, test } from "bun:test";
import type { Project } from "../../../src/core/project-discovery";

describe("Project interface", () => {
  test("can be constructed with name and path", () => {
    const project: Project = { name: "my-app", path: "/home/user/projects/my-app" };
    expect(project.name).toBe("my-app");
    expect(project.path).toBe("/home/user/projects/my-app");
  });
});
