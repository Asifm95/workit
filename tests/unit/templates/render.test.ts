import { describe, expect, test } from "bun:test";
import { renderTemplate } from "../../../src/templates/render";

describe("renderTemplate", () => {
  test("substitutes simple keys", () => {
    const out = renderTemplate("Hello {{name}}", { name: "world" });
    expect(out).toBe("Hello world");
  });

  test("substitutes multiple occurrences of same key", () => {
    const out = renderTemplate("{{x}} and {{x}}", { x: "foo" });
    expect(out).toBe("foo and foo");
  });

  test("leaves unknown keys intact", () => {
    const out = renderTemplate("{{known}} {{unknown}}", { known: "ok" });
    expect(out).toBe("ok {{unknown}}");
  });

  test("expands {{#each projects}}...{{/each}} blocks", () => {
    const tpl =
      "Projects:\n{{#each projects}}- {{folder}} ({{name}})\n{{/each}}";
    const out = renderTemplate(tpl, {
      projects: [
        { folder: "a.slug", name: "a" },
        { folder: "b.slug", name: "b" },
      ],
    });
    expect(out).toBe("Projects:\n- a.slug (a)\n- b.slug (b)\n");
  });

  test("each block with zero projects renders empty", () => {
    const out = renderTemplate("Start\n{{#each projects}}x\n{{/each}}End", {
      projects: [],
    });
    expect(out).toBe("Start\nEnd");
  });

  test("handles simple keys outside an each block that also contains them", () => {
    const tpl =
      "# {{title}}\n\n{{#each projects}}- {{name}}\n{{/each}}";
    const out = renderTemplate(tpl, {
      title: "My Feature",
      projects: [{ name: "p1" }],
    });
    expect(out).toBe("# My Feature\n\n- p1\n");
  });
});
