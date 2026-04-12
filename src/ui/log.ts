import pc from "picocolors";

export function prefixLine(name: string, line: string, width: number): string {
  const tag = `[${name}]`;
  const padded = tag.length < width ? tag.padEnd(width) : tag;
  return `${padded} ${line}`;
}

const COLORS = [pc.cyan, pc.magenta, pc.green, pc.yellow, pc.blue, pc.red];

export function colorFor(name: string): (s: string) => string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function info(msg: string): void {
  console.log(pc.bold(msg));
}
export function warn(msg: string): void {
  console.log(pc.yellow(`⚠ ${msg}`));
}
export function error(msg: string): void {
  console.error(pc.red(`✗ ${msg}`));
}
export function success(msg: string): void {
  console.log(pc.green(`✓ ${msg}`));
}
export function hint(msg: string): void {
  console.log(pc.dim(`💡 ${msg}`));
}
