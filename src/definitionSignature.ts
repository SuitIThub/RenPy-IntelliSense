import { stripInvisibleLeading } from "./docstringExtract";

function trimJoin(s: string): string {
  return s.split("\n").map((l) => l.trimEnd()).join("\n").trimEnd();
}

/**
 * Full definition header for hovers/completions: first line, or multiple lines
 * when the signature spans lines (e.g. `def foo(` / `    a, b):`).
 */
export function extractDefinitionSignature(lines: string[], startLine: number): string {
  if (startLine < 0 || startLine >= lines.length) return "";
  const max = Math.min(lines.length, startLine + 40);
  const firstLine = stripInvisibleLeading(lines[startLine]!);

  if (/^\s*(define|default|image)\s/i.test(firstLine)) {
    let acc = "";
    let depth = 0;
    for (let i = startLine; i < max; i++) {
      const line = lines[i] ?? "";
      acc += (acc ? "\n" : "") + line;
      for (const ch of line) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      if (depth === 0) {
        return trimJoin(acc);
      }
    }
    return trimJoin(acc);
  }

  let acc = "";
  for (let i = startLine; i < max; i++) {
    const line = lines[i] ?? "";
    acc += (acc ? "\n" : "") + line;
    const open = (acc.match(/\(/g) || []).length;
    const close = (acc.match(/\)/g) || []).length;
    const t = line.trimEnd();
    if (open === close && /:\s*(#.*)?$/.test(t)) {
      return trimJoin(acc);
    }
  }
  return trimJoin(lines[startLine] ?? "");
}
