import { stripInvisibleLeading } from "./docstringExtract";
import type { DefKind } from "./localDefinitions";

function trimJoin(s: string): string {
  return s.split("\n").map((l) => l.trimEnd()).join("\n").trimEnd();
}

function splitTopLevelCommaSeparated(s: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const prev = i > 0 ? s[i - 1] : "";

    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "{") brace++;
    else if (ch === "}") brace = Math.max(0, brace - 1);
    else if (ch === "," && paren === 0 && bracket === 0 && brace === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function extractParamListFromDefSignature(sig: string): string | null {
  const defIdx = sig.indexOf("def ");
  if (defIdx < 0) return null;
  const openIdx = sig.indexOf("(", defIdx);
  if (openIdx < 0) return null;

  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote: '"' | "'" | null = null;

  for (let i = openIdx; i < sig.length; i++) {
    const ch = sig[i]!;
    const prev = i > 0 ? sig[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") {
      paren--;
      if (paren === 0 && bracket === 0 && brace === 0) {
        return sig.slice(openIdx + 1, i);
      }
    } else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "{") brace++;
    else if (ch === "}") brace = Math.max(0, brace - 1);
  }
  return null;
}

/**
 * Find the __init__ method inside a class and extract its parameters (excluding self).
 * Returns null if no __init__ found or it has no parameters beyond self.
 */
function findInitParams(lines: string[], classLine: number): string | null {
  const classIndent = leadingSpaces(lines[classLine] ?? "");
  const max = Math.min(lines.length, classLine + 200);

  for (let i = classLine + 1; i < max; i++) {
    const line = lines[i] ?? "";
    const stripped = stripInvisibleLeading(line);

    // Skip empty/comment lines
    if (/^\s*$/.test(stripped) || /^\s*#/.test(stripped)) continue;

    const lineIndent = leadingSpaces(line);
    // If we've dedented back to class level or less, class body is over
    if (lineIndent <= classIndent && stripped.trim().length > 0) break;

    // Look for __init__ definition
    const initMatch = stripped.match(/^\s*def\s+__init__\s*\(/);
    if (initMatch) {
      // Extract the full __init__ signature (may span multiple lines)
      const initSig = extractDefSignatureFromLine(lines, i);
      // Parse out the parameters, excluding 'self'
      const allParamsRaw = extractParamListFromDefSignature(initSig);
      if (allParamsRaw !== null) {
        const allParams = allParamsRaw.trim();
        // Remove 'self' (first param) and clean up
        const params = splitTopLevelCommaSeparated(allParams)
          .map((p) => p.trim())
          .filter((p) => p && p !== "self" && !p.startsWith("self,"));
        
        // If self was the only param or had type annotation like "self: T"
        const filtered = params.filter((p) => !p.match(/^self\s*[:=]/));
        if (filtered.length > 0) {
          return filtered.join(", ");
        }
      }
      return null;
    }
  }
  return null;
}

function leadingSpaces(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1]!.length : 0;
}

/**
 * Extract a def signature starting from a given line (handles multi-line).
 */
function extractDefSignatureFromLine(lines: string[], startLine: number): string {
  const max = Math.min(lines.length, startLine + 20);
  let acc = "";
  for (let i = startLine; i < max; i++) {
    const line = lines[i] ?? "";
    acc += (acc ? "\n" : "") + line;
    const open = (acc.match(/\(/g) || []).length;
    const close = (acc.match(/\)/g) || []).length;
    const t = line.trimEnd();
    if (open === close && /:\s*(#.*)?$/.test(t)) {
      return acc;
    }
  }
  return acc;
}

function updateBracketDepth(line: string, depth: { paren: number; bracket: number; brace: number }): void {
  for (const ch of line) {
    if (ch === "(") depth.paren++;
    else if (ch === ")") depth.paren--;
    else if (ch === "[") depth.bracket++;
    else if (ch === "]") depth.bracket--;
    else if (ch === "{") depth.brace++;
    else if (ch === "}") depth.brace--;
  }
}

function hasOpenBrackets(depth: { paren: number; bracket: number; brace: number }): boolean {
  return depth.paren > 0 || depth.bracket > 0 || depth.brace > 0;
}

/**
 * Extract a variable/define/default assignment, including only continuation lines.
 * Stops before unrelated statements so variable hovers don't include large code blocks.
 */
function extractAssignmentSignature(lines: string[], startLine: number, maxLine: number): string {
  let acc = "";
  const depth = { paren: 0, bracket: 0, brace: 0 };
  let continueByBackslash = false;

  for (let i = startLine; i < maxLine; i++) {
    const line = lines[i] ?? "";
    if (i > startLine && !hasOpenBrackets(depth) && !continueByBackslash) {
      break;
    }

    acc += (acc ? "\n" : "") + line;
    updateBracketDepth(line, depth);
    continueByBackslash = /\\\s*$/.test(line);
  }

  return trimJoin(acc || (lines[startLine] ?? ""));
}

/**
 * Full definition header for hovers/completions: first line, or multiple lines
 * when the signature spans lines (e.g. `def foo(` / `    a, b):`).
 * 
 * For classes, combines the class name with __init__ parameters if available:
 * `class Test(var1, var2)` instead of just `class Test:`.
 */
export function extractDefinitionSignature(
  lines: string[],
  startLine: number,
  kind?: DefKind
): string {
  if (startLine < 0 || startLine >= lines.length) return "";
  const max = Math.min(lines.length, startLine + 40);
  const firstLine = stripInvisibleLeading(lines[startLine]!);

  // Handle class definitions specially - combine with __init__ params
  const classMatch = firstLine.match(/^(\s*class\s+\w+)\s*(?:\([^)]*\))?\s*:/);
  if (classMatch) {
    const classDecl = classMatch[1]!; // e.g. "class Test"
    const initParams = findInitParams(lines, startLine);
    if (initParams) {
      return `${classDecl}(${initParams})`;
    }
    // No __init__ or no params - return original class line
    return trimJoin(firstLine);
  }

  if (kind === "variable" || kind === "define" || kind === "default") {
    return extractAssignmentSignature(lines, startLine, max);
  }

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
