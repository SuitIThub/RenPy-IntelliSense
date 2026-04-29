import type { Range } from "vscode";
import type { IndexedSymbol } from "./qualifiedDefinitions";
import type { ReceiverInferenceContext } from "./receiverInference";
import { inferReceiverRootType, resolveMethodOnTypeHierarchy } from "./receiverInference";

/**
 * Find the actual line range of a docstring following a definition.
 * Returns [startLine, endLine] (0-based, inclusive) or null if no docstring found.
 */
function findDocstringRange(
  lines: string[],
  defLine: number
): { start: number; end: number } | null {
  let i = defLine + 1;

  // Skip blank lines and trivial statements (pass, ...)
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed === "" || trimmed === "pass" || trimmed === "...") {
      i++;
      continue;
    }
    break;
  }

  if (i >= lines.length) return null;

  const line = lines[i]!;
  const trimmed = line.trim();

  // Check for triple-quoted string
  const tripleMatch = trimmed.match(/^(r|u|R|U)?("""|''')/);
  if (tripleMatch) {
    const quote = tripleMatch[2] as '"""' | "'''";
    const startLine = i;

    // Check if single-line docstring (closes on same line)
    const afterOpen = trimmed.slice(tripleMatch[0].length);
    const closeIdx = afterOpen.indexOf(quote);
    if (closeIdx >= 0) {
      return { start: startLine, end: startLine };
    }

    // Multi-line: find closing quote
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]!.includes(quote)) {
        return { start: startLine, end: j };
      }
    }
    // Unclosed docstring - extend to reasonable limit
    return { start: startLine, end: Math.min(i + 50, lines.length - 1) };
  }

  // Check for hash-style comment block (Ren'Py)
  if (trimmed.startsWith("#")) {
    const startLine = i;
    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j]!.trim();
      if (t.startsWith("#")) {
        endLine = j;
      } else if (t === "") {
        // Allow blank lines within comment block
        continue;
      } else {
        break;
      }
    }
    return { start: startLine, end: endLine };
  }

  return null;
}

/**
 * Find the enclosing class if the given line is inside a class or method docstring.
 * Returns the class's qualified name (e.g., "OuterClass.InnerClass") or null.
 */
export function findEnclosingClassContext(
  indexed: IndexedSymbol[],
  hoverLine: number,
  documentText?: string
): string | null {
  const lines = documentText?.split(/\r?\n/);

  // Collect all class and method definitions that could own a docstring containing hoverLine
  const candidates = indexed
    .filter(
      (s) =>
        (s.kind === "class" || (s.kind === "def" && s.qualifiedName.includes("."))) &&
        s.line < hoverLine &&
        s.docstring // Must have a docstring
    )
    .sort((a, b) => b.line - a.line); // Most recent first

  for (const sym of candidates) {
    // If we have document text, compute exact docstring range
    if (lines) {
      const range = findDocstringRange(lines, sym.line);
      if (range && hoverLine >= range.start && hoverLine <= range.end) {
        if (sym.kind === "class") {
          return sym.qualifiedName;
        } else {
          // Method - return the class part
          const dot = sym.qualifiedName.lastIndexOf(".");
          return dot > 0 ? sym.qualifiedName.slice(0, dot) : null;
        }
      }
    } else {
      // Fallback: estimate based on docstring line count
      const docstringStartLine = sym.line + 1;
      const docLines = sym.docstring!.split("\n").length;
      const docstringEndLine = docstringStartLine + docLines + 2;

      if (hoverLine >= docstringStartLine && hoverLine <= docstringEndLine) {
        if (sym.kind === "class") {
          return sym.qualifiedName;
        } else {
          const dot = sym.qualifiedName.lastIndexOf(".");
          return dot > 0 ? sym.qualifiedName.slice(0, dot) : null;
        }
      }
    }
  }

  return null;
}

function skipSpacesLeft(line: string, i: number): number {
  let j = i;
  while (j >= 0 && /\s/.test(line[j]!)) j--;
  return j;
}

/** Strip trailing `[...]` subscripts (balanced) from a receiver expression string. */
export function stripTrailingSubscripts(receiver: string): string {
  let t = receiver.trimEnd();
  for (;;) {
    if (!t.endsWith("]")) break;
    let depth = 0;
    let i = t.length - 1;
    for (; i >= 0; i--) {
      const c = t[i]!;
      if (c === "]") depth++;
      else if (c === "[") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i < 0) break;
    t = t.slice(0, i).trimEnd();
  }
  return t.trimEnd();
}

/** Bounds of the smallest expression whose last character is at `endInclusive` (0-based column). */
function expressionBoundsEndingAt(line: string, endInclusive: number): { start: number; end: number } | null {
  const e = skipSpacesLeft(line, endInclusive);
  if (e < 0) return null;

  const ch = line[e]!;
  if (ch === "]") {
    let depth = 1;
    let i = e - 1;
    for (; i >= 0; i--) {
      const c = line[i]!;
      if (c === "]") depth++;
      else if (c === "[") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i < 0) return null;
    const inner = expressionBoundsEndingAt(line, i - 1);
    if (!inner) return null;
    return { start: inner.start, end: e };
  }

  if (ch === ")") {
    let depth = 1;
    let i = e - 1;
    for (; i >= 0; i--) {
      const c = line[i]!;
      if (c === ")") depth++;
      else if (c === "(") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i < 0) return null;
    const inner = expressionBoundsEndingAt(line, i - 1);
    if (!inner) return null;
    return { start: inner.start, end: e };
  }

  if (/[\w.]/.test(ch)) {
    let s = e;
    while (s > 0 && /[\w.]/.test(line[s - 1]!)) s--;
    return { start: s, end: e };
  }

  return null;
}

/**
 * Expression immediately to the left of `.identifier` (not the whole line prefix),
 * e.g. `$ aona = Person["x"].get_y` → `Person["x"]` → normalized `Person`.
 */
export function receiverBeforeMemberAccess(line: string, identifierStartCol: number): string | null {
  if (identifierStartCol <= 0) return null;
  if (line[identifierStartCol - 1] !== ".") return null;
  const end = identifierStartCol - 2;
  const bounds = expressionBoundsEndingAt(line, end);
  if (!bounds) return null;
  const raw = line.slice(bounds.start, bounds.end + 1);
  const norm = stripTrailingSubscripts(raw);
  if (!/^[\w.]+$/.test(norm)) return null;
  return norm;
}

function pickLatestAtOrBefore(
  symbols: IndexedSymbol[],
  atLine: number,
  currentFsPath?: string
): IndexedSymbol | undefined {
  if (symbols.length === 0) return undefined;

  if (currentFsPath) {
    const local = symbols.filter((s) => s.uri.fsPath === currentFsPath && s.line <= atLine);
    if (local.length > 0) return local.reduce((a, b) => (a.line > b.line ? a : b));
  }

  const xs = symbols.filter((s) => s.line <= atLine);
  if (xs.length > 0) return xs.reduce((a, b) => (a.line > b.line ? a : b));

  const sorted = symbols
    .slice()
    .sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath) || a.line - b.line);
  return sorted[0];
}

export interface HoverResolveOptions {
  inference?: ReceiverInferenceContext;
  /** Enclosing class context (e.g., from being inside a class/method docstring) */
  enclosingClass?: string | null;
}

/**
 * Resolve which indexed symbol to show for hover: member chains (Type[...].method),
 * enclosing class context (for docstrings), then optional label context for simple names.
 */
export function resolveIndexedSymbolForHover(
  indexed: IndexedSymbol[],
  lineText: string,
  range: Range,
  hoverLine: number,
  optionsOrInference?: HoverResolveOptions | ReceiverInferenceContext
): IndexedSymbol | undefined {
  // Support both old signature (inference only) and new options object
  const options: HoverResolveOptions =
    optionsOrInference && "currentUri" in optionsOrInference
      ? { inference: optionsOrInference }
      : (optionsOrInference as HoverResolveOptions) ?? {};

  const { inference, enclosingClass } = options;

  const symbol = lineText.slice(range.start.character, range.end.character);
  if (!symbol) return undefined;

  const receiver = receiverBeforeMemberAccess(lineText, range.start.character);
  const currentFsPath = inference?.currentUri.fsPath;
  if (receiver) {
    const qualified = `${receiver}.${symbol}`;
    const exact = indexed.filter((s) => s.qualifiedName === qualified);
    const hit = pickLatestAtOrBefore(exact, hoverLine, currentFsPath);
    if (hit) return hit;

    const relaxed = indexed.filter(
      (s) =>
        s.kind === "def" &&
        s.simpleName === symbol &&
        (s.qualifiedName === qualified || s.qualifiedName.startsWith(`${receiver}.`))
    );
    const relaxedHit = pickLatestAtOrBefore(relaxed, hoverLine, currentFsPath);
    if (relaxedHit) return relaxedHit;

    if (inference && /^[\w]+$/.test(receiver)) {
      const root = inferReceiverRootType(
        receiver,
        hoverLine,
        inference.hints,
        inference.defs,
        inference.currentUri
      );
      if (root) {
        const inferredQ = resolveMethodOnTypeHierarchy(root, symbol, inference.defs) ?? `${root}.${symbol}`;
        const exactInf = indexed.filter((s) => s.qualifiedName === inferredQ);
        const hitInf = pickLatestAtOrBefore(exactInf, hoverLine, currentFsPath);
        if (hitInf) return hitInf;

        const relaxedInf = indexed.filter(
          (s) =>
            s.kind === "def" &&
            s.simpleName === symbol &&
            (s.qualifiedName === inferredQ || s.qualifiedName.startsWith(`${root}.`))
        );
        const relaxedInfHit = pickLatestAtOrBefore(relaxedInf, hoverLine, currentFsPath);
        if (relaxedInfHit) return relaxedInfHit;
      }
    }
  }

  // When inside a class/method docstring, prefer members of that class
  if (enclosingClass && !receiver) {
    const classQualified = `${enclosingClass}.${symbol}`;
    const classMembers = indexed.filter(
      (s) => s.qualifiedName === classQualified || s.qualifiedName.startsWith(`${classQualified}.`)
    );
    const classHit = pickLatestAtOrBefore(classMembers, hoverLine, currentFsPath);
    if (classHit) return classHit;

    // Also check for attributes/variables defined in the class
    const classMembersBySimple = indexed.filter(
      (s) =>
        s.simpleName === symbol &&
        (s.qualifiedName === classQualified || s.qualifiedName.startsWith(`${enclosingClass}.`))
    );
    const simpleHit = pickLatestAtOrBefore(classMembersBySimple, hoverLine, currentFsPath);
    if (simpleHit) return simpleHit;
  }

  const labelCtx = lastLabelQualifiedBeforeLine(indexed, hoverLine);
  if (labelCtx) {
    const labelQualified = `${labelCtx}.${symbol}`;
    const labelHit = indexed.filter((s) => s.kind === "label" && s.qualifiedName === labelQualified);
    const lh = pickLatestAtOrBefore(labelHit, hoverLine);
    if (lh) return lh;
    if (symbol.startsWith(".")) {
      const dotted = `${labelCtx}${symbol}`;
      const lh2 = indexed.filter((s) => s.kind === "label" && s.qualifiedName === dotted);
      const x = pickLatestAtOrBefore(lh2, hoverLine);
      if (x) return x;
    }
  }

  return undefined;
}

export function lastLabelQualifiedBeforeLine(indexed: IndexedSymbol[], atLine: number): string | null {
  const labels = indexed.filter((s) => s.kind === "label" && s.line <= atLine);
  if (labels.length === 0) return null;
  labels.sort((a, b) => a.line - b.line);
  return labels[labels.length - 1]!.qualifiedName;
}
