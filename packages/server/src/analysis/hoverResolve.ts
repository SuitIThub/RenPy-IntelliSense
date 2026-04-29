/**
 * Resolve which indexed symbol to show for hover: member chains (Type[...].method),
 * then optional label context for simple names.
 */

import { IndexedSymbol, ReceiverInferenceContext } from "@renpy-intellisense/shared";
import { inferReceiverRootType, resolveMethodOnTypeHierarchy } from "./inference";

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
  currentUri?: string
): IndexedSymbol | undefined {
  if (symbols.length === 0) return undefined;

  if (currentUri) {
    const local = symbols.filter((s) => s.uri === currentUri && s.line <= atLine);
    if (local.length > 0) return local.reduce((a, b) => (a.line > b.line ? a : b));
  }

  const xs = symbols.filter((s) => s.line <= atLine);
  if (xs.length > 0) return xs.reduce((a, b) => (a.line > b.line ? a : b));

  const sorted = symbols
    .slice()
    .sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line);
  return sorted[0];
}

/**
 * Resolve which indexed symbol to show for hover: member chains (Type[...].method),
 * then optional label context for simple names.
 */
export function resolveIndexedSymbolForHover(
  indexed: IndexedSymbol[],
  lineText: string,
  startChar: number,
  endChar: number,
  hoverLine: number,
  inference?: ReceiverInferenceContext
): IndexedSymbol | undefined {
  const symbol = lineText.slice(startChar, endChar);
  if (!symbol) return undefined;

  const receiver = receiverBeforeMemberAccess(lineText, startChar);
  const currentUri = inference?.currentUri;
  if (receiver) {
    const qualified = `${receiver}.${symbol}`;
    const exact = indexed.filter((s) => s.qualifiedName === qualified);
    const hit = pickLatestAtOrBefore(exact, hoverLine, currentUri);
    if (hit) return hit;

    const relaxed = indexed.filter(
      (s) =>
        s.kind === "def" &&
        s.simpleName === symbol &&
        (s.qualifiedName === qualified || s.qualifiedName.startsWith(`${receiver}.`))
    );
    const relaxedHit = pickLatestAtOrBefore(relaxed, hoverLine, currentUri);
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
        const hitInf = pickLatestAtOrBefore(exactInf, hoverLine, currentUri);
        if (hitInf) return hitInf;

        const relaxedInf = indexed.filter(
          (s) =>
            s.kind === "def" &&
            s.simpleName === symbol &&
            (s.qualifiedName === inferredQ || s.qualifiedName.startsWith(`${root}.`))
        );
        const relaxedInfHit = pickLatestAtOrBefore(relaxedInf, hoverLine, currentUri);
        if (relaxedInfHit) return relaxedInfHit;
      }
    }
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
