import { describe, expect, test } from "bun:test";
import { branchName, folderName, workspaceFolderName } from "../../../src/core/naming";

describe("branchName", () => {
  test("combines type and slug", () => {
    expect(branchName("feat", "add-dac7")).toBe("feat/add-dac7");
  });
});

describe("folderName", () => {
  test("combines project and slug with a dot", () => {
    expect(folderName("storelink-dashboard", "add-dac7")).toBe(
      "storelink-dashboard.add-dac7"
    );
  });
});

describe("workspaceFolderName", () => {
  test("is just the slug", () => {
    expect(workspaceFolderName("add-dac7")).toBe("add-dac7");
  });
});
