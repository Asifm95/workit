export type TemplateValue = string | number | boolean;
export type TemplateContext = {
  [key: string]: TemplateValue | TemplateContext[] | undefined;
};

const EACH_RE = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const KEY_RE = /\{\{(\w+)\}\}/g;

function substituteKeys(str: string, ctx: TemplateContext): string {
  return str.replace(KEY_RE, (match, key: string) => {
    const value = ctx[key];
    if (value == null || typeof value === "object") return match;
    return String(value);
  });
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const expanded = template.replace(EACH_RE, (_match, key: string, body: string) => {
    const list = ctx[key];
    if (!Array.isArray(list)) return "";
    return list.map((item) => substituteKeys(body, item)).join("");
  });
  return substituteKeys(expanded, ctx);
}
