/**
 * Scan a document for simple definitions (Python + common Ren'Py forms)
 * and map symbol name -> list of { definition line, docstring }.
 */

import { extractDocstringAfterDefinition, extractDocstringBeforeDefinition, stripInvisibleLeading } from "./docstringExtract";
import { LabelContextTracker } from "./labelQualification";

export type DefKind =
  | "def"
  | "class"
  | "label"
  | "define"
  | "default"
  | "screen"
  | "transform"
  | "image"
  | "variable"
  | "variable_local";

export interface LocalDefinition {
  name: string;
  kind: DefKind;
  /** 0-based line index of the definition line */
  line: number;
  docstring: string | null;
}

const DEF_PATTERNS: { kind: DefKind; re: RegExp }[] = [
  /**
   * Same-line decorators (e.g. `@staticmethod def foo():`). Optional `(...)` per segment — no nested parens.
   * Multi-line decorators sit on their own lines and do not need this.
   */
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*async\s+def\s+(\w+)\s*\(/ },
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*def\s+(\w+)\s*\(/ },
  { kind: "class", re: /^\s*class\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "label", re: /^\s*label\s+([\w.]+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "define", re: /^\s*define\s+(\w+)\s*=/ },
  { kind: "default", re: /^\s*default\s+(\w+)\s*=/ },
  { kind: "screen", re: /^\s*screen\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "transform", re: /^\s*transform\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "image", re: /^\s*image\s+(\w+)/ },
  // Ren'Py inline Python assignment in script scope (local to the scope)
  { kind: "variable_local", re: /^\s*\$\s*(\w+)\s*=(?!=)/ },
  // Plain Python variable assignment (must be last to not shadow other patterns)
  { kind: "variable", re: /^\s*(\w+)\s*=(?!=)/ },
];

/** Kinds that support comment-above-line as docstring (variable initializations) */
const VARIABLE_KINDS: Set<DefKind> = new Set(["define", "default", "variable", "variable_local"]);

export function scanLocalDefinitions(text: string): LocalDefinition[] {
  const lines = text.split(/\r?\n/);
  const out: LocalDefinition[] = [];
  const labelCtx = new LabelContextTracker();

  for (let i = 0; i < lines.length; i++) {
    const line = stripInvisibleLeading(lines[i]!);
    for (const { kind, re } of DEF_PATTERNS) {
      const m = line.match(re);
      if (!m?.[1]) continue;
      const rawName = m[1];
      const name =
        kind === "label"
          ? labelCtx.qualify(rawName).qualified
          : rawName.includes(".")
            ? rawName.split(".").pop()!
            : rawName;

      // For variable-like definitions, prefer comment blocks above; fall back to after
      let docstring: string | null = null;
      if (VARIABLE_KINDS.has(kind)) {
        docstring = extractDocstringBeforeDefinition(lines, i);
      }
      if (docstring === null) {
        docstring = extractDocstringAfterDefinition(lines, i);
      }

      out.push({ name, kind, line: i, docstring });
      break;
    }
  }

  return out;
}

export function indexDefinitions(defs: LocalDefinition[]): Map<string, LocalDefinition[]> {
  const m = new Map<string, LocalDefinition[]>();
  for (const d of defs) {
    const arr = m.get(d.name) ?? [];
    arr.push(d);
    m.set(d.name, arr);
  }
  return m;
}

function symbolMatchesDefinition(d: LocalDefinition, symbol: string): boolean {
  if (d.name === symbol) return true;
  const plain = symbol.includes(".") ? symbol.split(".").pop()! : symbol;
  if (d.name === plain) return true;
  if (d.kind === "label") {
    if (d.name === symbol) return true;
    if (d.name.includes(".")) {
      const seg = d.name.split(".").pop()!;
      if (seg === plain || seg === symbol) return true;
    }
  }
  return false;
}

/**
 * Pick the definition for `symbol` whose header is at or before `atLine`, preferring
 * the latest such line (innermost / same-line when the cursor is on the definition).
 *
 * Using `d.line >= atLine` was wrong: hovering `class Foo` or `def bar` on the header
 * line skipped that definition and attached the previous symbol's docstring instead.
 */
export function definitionForSymbolAtLine(
  defs: LocalDefinition[],
  symbol: string,
  atLine: number
): LocalDefinition | null {
  const candidates = defs.filter((d) => symbolMatchesDefinition(d, symbol));
  if (candidates.length === 0) return null;

  // `$ var = ...` should resolve locally (nearest previous in current file scope),
  // not to the first assignment in the file.
  let bestLocal: LocalDefinition | null = null;
  for (const d of candidates) {
    if (d.kind !== "variable_local" || d.line > atLine) continue;
    if (!bestLocal || d.line > bestLocal.line) bestLocal = d;
  }
  if (bestLocal) return bestLocal;

  // For variable-like symbols, show the original initialization instead of
  // later reassignments/overwrites.
  const variableLike = candidates.filter((d) =>
    d.kind === "variable" || d.kind === "define" || d.kind === "default"
  );
  if (variableLike.length > 0) {
    let first = variableLike[0]!;
    for (const d of variableLike) {
      if (d.line < first.line) first = d;
    }
    return first;
  }

  let best: LocalDefinition | null = null;
  for (const d of candidates) {
    if (d.line > atLine) continue;
    if (!best || d.line > best.line) best = d;
  }
  return best;
}
