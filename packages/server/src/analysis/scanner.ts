/**
 * Single-pass scan with a class indent stack so methods get qualified names
 * (e.g. FragmentStorage.add_event) for project-wide cross-references.
 */

import { IndexedSymbol, DefKind, LocalDefinition } from "@renpy-intellisense/shared";
import { extractDocstringAfterDefinition, extractDocstringBeforeDefinition, stripInvisibleLeading } from "./docstrings";
import { LabelContextTracker } from "./labelQualification";

/** Kinds that support comment-above-line as docstring (variable initializations) */
const VARIABLE_KINDS: Set<DefKind> = new Set(["define", "default", "variable", "variable_local"]);

interface ClassFrame {
  name: string;
  indent: number;
}

const PATTERNS: { kind: DefKind; re: RegExp }[] = [
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*async\s+def\s+(\w+)\s*\(/ },
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*def\s+(\w+)\s*\(/ },
  { kind: "class", re: /^\s*class\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "label", re: /^\s*label\s+([\w.]+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "define", re: /^\s*define\s+(\w+)\s*=/ },
  { kind: "default", re: /^\s*default\s+(\w+)\s*=/ },
  { kind: "screen", re: /^\s*screen\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "transform", re: /^\s*transform\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "image", re: /^\s*image\s+(\w+)/ },
  { kind: "variable_local", re: /^\s*\$\s*(\w+)\s*=(?!=)/ },
  { kind: "variable", re: /^\s*(\w+)\s*=(?!=)/ },
];

function leadingIndentCols(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1]!.length : 0;
}

function qualifyFromStack(classStack: ClassFrame[], name: string): string {
  if (classStack.length === 0) return name;
  return `${classStack.map((c) => c.name).join(".")}.${name}`;
}

/** First identifier / dotted name after `->` (best-effort; same line as `def`). */
function parseDefReturnTypeHint(raw: string): string | undefined {
  const arrow = raw.indexOf("->");
  if (arrow < 0) return undefined;
  let tail = raw.slice(arrow + 2).trimStart();
  for (;;) {
    const wrap = tail.match(/^(Optional|Union)\s*\[\s*([\w.]+)/);
    if (wrap) {
      tail = wrap[2]!.trimStart();
      continue;
    }
    break;
  }
  const m = tail.match(/^([\w.]+)/);
  return m?.[1] ?? undefined;
}

/** First identifier / dotted name inside `class X(Base):` (best-effort; same line). */
function parseClassBaseTypeHint(raw: string): string | undefined {
  const m = raw.match(/^\s*class\s+\w+\s*\(\s*([\w.]+)/);
  if (!m?.[1]) return undefined;
  const tail = m[1].split(".").at(-1);
  return tail || undefined;
}

/**
 * Map indexed symbol to the same `name` field semantics as `scanLocalDefinitions` for hover matching.
 */
export function indexedToLocalName(s: IndexedSymbol): string {
  if (s.kind === "label") return s.qualifiedName;
  return s.simpleName;
}

export function indexedSymbolsToLocalDefinitions(symbols: IndexedSymbol[]): LocalDefinition[] {
  return symbols.map((s) => ({
    name: indexedToLocalName(s),
    kind: s.kind,
    line: s.line,
    docstring: s.docstring,
  }));
}

/** Extract docstring for a definition, checking above for variable kinds first */
function extractDocstringForKind(lines: string[], lineIdx: number, kind: DefKind): string | null {
  if (VARIABLE_KINDS.has(kind)) {
    const before = extractDocstringBeforeDefinition(lines, lineIdx);
    if (before !== null) return before;
  }
  return extractDocstringAfterDefinition(lines, lineIdx);
}

export function scanQualifiedDefinitions(text: string, uri: string): IndexedSymbol[] {
  const lines = text.split(/\r?\n/);
  const out: IndexedSymbol[] = [];
  const classStack: ClassFrame[] = [];
  const labelCtx = new LabelContextTracker();

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInvisibleLeading(lines[i]!);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = leadingIndentCols(raw);

    while (classStack.length > 0 && classStack[classStack.length - 1]!.indent >= indent) {
      classStack.pop();
    }

    for (const { kind, re } of PATTERNS) {
      const m = raw.match(re);
      if (!m?.[1]) continue;

      const rawName = m[1];
      const docstring = extractDocstringForKind(lines, i, kind);

      if (kind === "class") {
        const name = rawName;
        classStack.push({ name, indent });
        const qualified = classStack.map((c) => c.name).join(".");
        out.push({
          qualifiedName: qualified,
          simpleName: name,
          kind,
          line: i,
          docstring,
          uri,
          baseTypeHint: parseClassBaseTypeHint(raw),
        });
        break;
      }

      if (kind === "def") {
        const name = rawName;
        const qualified = qualifyFromStack(classStack, name);
        out.push({
          qualifiedName: qualified,
          simpleName: name,
          kind,
          line: i,
          docstring,
          uri,
          returnTypeHint: parseDefReturnTypeHint(raw),
        });
        break;
      }

      if (kind === "label") {
        const { qualified, simple } = labelCtx.qualify(rawName);
        const dot = qualified.lastIndexOf(".");
        out.push({
          qualifiedName: qualified,
          simpleName: simple,
          kind,
          line: i,
          docstring,
          uri,
          ...(dot > 0 ? { parentLabelHint: qualified.slice(0, dot) } : {}),
        });
        break;
      }

      const name = rawName;
      const qualified = qualifyFromStack(classStack, name);
      out.push({ qualifiedName: qualified, simpleName: name, kind, line: i, docstring, uri });
      break;
    }
  }

  return out;
}

// Local definitions scanner (simpler, no class qualification)
const DEF_PATTERNS: { kind: DefKind; re: RegExp }[] = [
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*async\s+def\s+(\w+)\s*\(/ },
  { kind: "def", re: /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*def\s+(\w+)\s*\(/ },
  { kind: "class", re: /^\s*class\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "label", re: /^\s*label\s+([\w.]+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "define", re: /^\s*define\s+(\w+)\s*=/ },
  { kind: "default", re: /^\s*default\s+(\w+)\s*=/ },
  { kind: "screen", re: /^\s*screen\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "transform", re: /^\s*transform\s+(\w+)\s*(?:\([^)]*\))?\s*:/ },
  { kind: "image", re: /^\s*image\s+(\w+)/ },
  { kind: "variable_local", re: /^\s*\$\s*(\w+)\s*=(?!=)/ },
  { kind: "variable", re: /^\s*(\w+)\s*=(?!=)/ },
];

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
 */
export function definitionForSymbolAtLine(
  defs: LocalDefinition[],
  symbol: string,
  atLine: number
): LocalDefinition | null {
  const candidates = defs.filter((d) => symbolMatchesDefinition(d, symbol));
  if (candidates.length === 0) return null;

  let bestLocal: LocalDefinition | null = null;
  for (const d of candidates) {
    if (d.kind !== "variable_local" || d.line > atLine) continue;
    if (!bestLocal || d.line > bestLocal.line) bestLocal = d;
  }
  if (bestLocal) return bestLocal;

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
