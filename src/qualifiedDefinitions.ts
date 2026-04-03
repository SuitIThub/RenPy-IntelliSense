/**
 * Single-pass scan with a class indent stack so methods get qualified names
 * (e.g. FragmentStorage.add_event) for project-wide cross-references.
 */

import type { Uri } from "vscode";
import { extractDocstringAfterDefinition, stripInvisibleLeading } from "./docstringExtract";
import type { DefKind } from "./localDefinitions";

export interface IndexedSymbol {
  /** e.g. "FragmentStorage.add_event", "Outer.Inner" */
  qualifiedName: string;
  /** Short name for hover matching (method/class name, or label segment) */
  simpleName: string;
  kind: DefKind;
  line: number;
  docstring: string | null;
  uri: Uri;
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
];

function leadingIndentCols(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1]!.length : 0;
}

function qualifyFromStack(classStack: ClassFrame[], name: string): string {
  if (classStack.length === 0) return name;
  return `${classStack.map((c) => c.name).join(".")}.${name}`;
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

export function scanQualifiedDefinitions(text: string, uri: Uri): IndexedSymbol[] {
  const lines = text.split(/\r?\n/);
  const out: IndexedSymbol[] = [];
  const classStack: ClassFrame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInvisibleLeading(lines[i]!);
    const indent = leadingIndentCols(raw);

    while (classStack.length > 0 && classStack[classStack.length - 1]!.indent >= indent) {
      classStack.pop();
    }

    for (const { kind, re } of PATTERNS) {
      const m = raw.match(re);
      if (!m?.[1]) continue;

      const rawName = m[1];
      const docstring = extractDocstringAfterDefinition(lines, i);

      if (kind === "class") {
        const name = rawName;
        classStack.push({ name, indent });
        const qualified = classStack.map((c) => c.name).join(".");
        out.push({ qualifiedName: qualified, simpleName: name, kind, line: i, docstring, uri });
        break;
      }

      if (kind === "def") {
        const name = rawName;
        const qualified = qualifyFromStack(classStack, name);
        out.push({ qualifiedName: qualified, simpleName: name, kind, line: i, docstring, uri });
        break;
      }

      if (kind === "label") {
        const full = rawName;
        out.push({
          qualifiedName: full,
          simpleName: full,
          kind,
          line: i,
          docstring,
          uri,
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
