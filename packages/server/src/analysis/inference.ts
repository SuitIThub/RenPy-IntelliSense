/**
 * Receiver/type inference for resolving method calls like `storage.add_event()`
 * based on assignments and return type hints.
 */

import { IndexedSymbol, AssignmentRhsHint, ReceiverInferenceContext } from "@renpy-intellisense/shared";
import { stripInvisibleLeading } from "./docstrings";
import { scanQualifiedDefinitions } from "./scanner";

export function scanAssignmentHints(lines: string[], uri: string): AssignmentRhsHint[] {
  const out: AssignmentRhsHint[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = stripInvisibleLeading(lines[i]!);

    const defineDefault = raw.match(/^\s*(?:define|default)\s+(\w+)\s*=\s*(.+)$/);
    if (defineDefault) {
      out.push({
        uri,
        line: i,
        lhs: defineDefault[1]!,
        rhsExpr: defineDefault[2]!.trimEnd(),
        isLocal: false,
      });
      continue;
    }

    const dollar = raw.match(/^\s*\$\s*(\w+)\s*=\s*(.+)$/);
    if (dollar) {
      out.push({
        uri,
        line: i,
        lhs: dollar[1]!,
        rhsExpr: dollar[2]!.trimEnd(),
        isLocal: true,
      });
      continue;
    }

    const dollarTyped = raw.match(/^\s*\$\s*(\w+)\s*:\s*[^=]+\s*=\s*(.+)$/);
    if (dollarTyped) {
      out.push({
        uri,
        line: i,
        lhs: dollarTyped[1]!,
        rhsExpr: dollarTyped[2]!.trimEnd(),
        isLocal: true,
      });
      continue;
    }

    if (/^\s*(def|class|label|screen|transform|image|return)\b/.test(raw)) continue;

    const typed = raw.match(/^\s*(\w+)\s*:\s*[^=]+\s*=\s*(.+)$/);
    if (typed) {
      out.push({
        uri,
        line: i,
        lhs: typed[1]!,
        rhsExpr: typed[2]!.trimEnd(),
        isLocal: false,
      });
      continue;
    }

    const plain = raw.match(/^\s*(\w+)\s*=\s*(.+)$/);
    if (plain) {
      out.push({
        uri,
        line: i,
        lhs: plain[1]!,
        rhsExpr: plain[2]!.trimEnd(),
        isLocal: false,
      });
    }
  }
  return out;
}

/** `Foo(` at RHS start → constructor / class name; `bar(` → callee for return-type lookup. */
function parseCallishRhs(rhs: string): { name: string; isConstructor: boolean } | null {
  const t = rhs.trimStart();
  const m = t.match(/^([\w.]+)\s*\(/);
  if (!m) return null;
  const name = m[1]!;
  const tail = name.split(".").at(-1) ?? name;
  const c0 = tail[0]!;
  const isConstructor = c0 >= "A" && c0 <= "Z";
  return { name: tail, isConstructor };
}

function resolveCalleeReturnType(
  callee: string,
  assignmentUri: string,
  assignmentLine: number,
  defs: IndexedSymbol[]
): string | null {
  const withRt = defs.filter(
    (d) => d.kind === "def" && d.simpleName === callee && d.returnTypeHint
  );
  if (withRt.length === 0) return null;

  const sameFile = withRt.filter(
    (d) => d.uri === assignmentUri && d.line <= assignmentLine
  );
  if (sameFile.length > 0) {
    return sameFile.reduce((a, b) => (a.line > b.line ? a : b)).returnTypeHint ?? null;
  }

  if (withRt.length === 1) return withRt[0]!.returnTypeHint ?? null;

  withRt.sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line);
  return withRt[0]!.returnTypeHint ?? null;
}

export function resolveMethodOnTypeHierarchy(
  typeName: string,
  method: string,
  defs: IndexedSymbol[]
): string | null {
  const visited = new Set<string>();
  const queue: string[] = [typeName];

  while (queue.length > 0) {
    const t = queue.shift()!;
    if (visited.has(t)) continue;
    visited.add(t);

    const methodCandidates = defs.filter(
      (d) => d.kind === "def" && d.qualifiedName === `${t}.${method}`
    );
    if (methodCandidates.length > 0) return `${t}.${method}`;

    const classes = defs.filter((d) => d.kind === "class" && d.simpleName === t);
    for (const cls of classes) {
      if (cls.baseTypeHint && !visited.has(cls.baseTypeHint)) queue.push(cls.baseTypeHint);
    }
  }

  return null;
}

/**
 * Infer a root type name for a simple receiver (`storage` or `image`) from the latest
 * relevant assignment (locals: same file before `hoverLine`; globals: latest by path+line).
 */
export function inferReceiverRootType(
  receiver: string,
  hoverLine: number,
  hints: AssignmentRhsHint[],
  defs: IndexedSymbol[],
  currentUri: string
): string | null {
  const localCandidates = hints.filter(
    (h) =>
      h.lhs === receiver &&
      h.isLocal &&
      h.uri === currentUri &&
      h.line < hoverLine
  );
  const globalCandidates = hints.filter((h) => h.lhs === receiver && !h.isLocal);

  const localsDesc = localCandidates.slice().sort((a, b) => b.line - a.line);
  for (const h of localsDesc) {
    const call = parseCallishRhs(h.rhsExpr);
    if (!call) continue;
    if (call.isConstructor) return call.name;
    const rt = resolveCalleeReturnType(call.name, h.uri, h.line, defs);
    if (rt) return rt;
  }

  const globalsDesc = globalCandidates
    .slice()
    .sort((a, b) => b.uri.localeCompare(a.uri) || b.line - a.line);
  for (const h of globalsDesc) {
    const call = parseCallishRhs(h.rhsExpr);
    if (!call) continue;
    if (call.isConstructor) return call.name;
    const rt = resolveCalleeReturnType(call.name, h.uri, h.line, defs);
    if (rt) return rt;
  }

  return null;
}

/**
 * `gym_foo.add_event` → `FragmentStorage.add_event` when `gym_foo` is inferred as `FragmentStorage`.
 * Only single-segment receivers (no nested `a.b.method`).
 */
export function tryExpandChainedCallee(
  callee: string,
  hoverLine: number,
  ctx: ReceiverInferenceContext
): string | null {
  const lastDot = callee.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const recv = callee.slice(0, lastDot);
  const method = callee.slice(lastDot + 1);
  if (!recv || !method || recv.includes(".")) return null;
  const root = inferReceiverRootType(recv, hoverLine, ctx.hints, ctx.defs, ctx.currentUri);
  if (!root) return null;
  return resolveMethodOnTypeHierarchy(root, method, ctx.defs) ?? `${root}.${method}`;
}

export function collectReceiverInferenceContext(
  uri: string,
  fullText: string,
  foreignAssignmentHints: AssignmentRhsHint[],
  foreignSymbols: IndexedSymbol[]
): ReceiverInferenceContext {
  const lines = fullText.split(/\r?\n/);
  const hints = [...foreignAssignmentHints, ...scanAssignmentHints(lines, uri)];
  const liveIndexed = scanQualifiedDefinitions(fullText, uri);
  const defs = [
    ...liveIndexed.filter((s) => s.kind === "def" || s.kind === "class"),
    ...foreignSymbols.filter((s) => s.kind === "def" || s.kind === "class"),
  ];
  return { hints, defs, currentUri: uri };
}
