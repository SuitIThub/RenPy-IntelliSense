/**
 * Single-pass scan with a class indent stack so methods get qualified names
 * (e.g. FragmentStorage.add_event) for project-wide cross-references.
 */

import type { Uri } from "vscode";
import { extractDocstringAfterDefinition, extractDocstringBeforeDefinition, stripInvisibleLeading } from "./docstringExtract";
import { LabelContextTracker } from "./labelQualification";
import type { DefKind } from "./localDefinitions";

/** Kinds that support comment-above-line as docstring (variable initializations) */
const VARIABLE_KINDS: Set<DefKind> = new Set(["define", "default", "variable", "variable_local"]);

export interface IndexedSymbol {
  /** e.g. "FragmentStorage.add_event", "Outer.Inner" */
  qualifiedName: string;
  /** Short name for hover matching (method/class name, or label segment) */
  simpleName: string;
  kind: DefKind;
  line: number;
  docstring: string | null;
  uri: Uri;
  /** First token after `->` on the same line as `def` (receiver inference). */
  returnTypeHint?: string;
  /** First base class token in `class X(Base):` (receiver inference / inheritance). */
  baseTypeHint?: string;
  /** Parent label for dotted labels, e.g. `a.b` -> `a`. */
  parentLabelHint?: string;
}

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
  // Ren'Py inline Python assignment in script scope (local to the scope)
  { kind: "variable_local", re: /^\s*\$\s*(\w+)\s*=(?!=)/ },
  // Plain Python variable assignment (must be last to not shadow other patterns)
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

export function indexedSymbolsToLocalDefinitions(
  symbols: IndexedSymbol[]
): import("./localDefinitions").LocalDefinition[] {
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

export function scanQualifiedDefinitions(text: string, uri: Uri): IndexedSymbol[] {
  const lines = text.split(/\r?\n/);
  const out: IndexedSymbol[] = [];
  const classStack: ClassFrame[] = [];
  const labelCtx = new LabelContextTracker();

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInvisibleLeading(lines[i]!);
    const trimmed = raw.trim();
    // Blank / comment-only lines must not alter class nesting.
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
