import * as vscode from "vscode";
import { createMergedCrossRefResolver } from "./crossRefResolver";
import { extractDefinitionSignature } from "./definitionSignature";
import type { ProjectIndex } from "./projectIndex";
import { scanQualifiedDefinitions } from "./qualifiedDefinitions";
import { isRenpyFile } from "./symbolRange";

/** All text in the document strictly before `position` (for finding the active `(`). */
function textBeforeCursor(doc: vscode.TextDocument, position: vscode.Position): string {
  const lines: string[] = [];
  for (let i = 0; i < position.line; i++) {
    lines.push(doc.lineAt(i).text);
  }
  lines.push(doc.lineAt(position.line).text.slice(0, position.character));
  return lines.join("\n");
}

/**
 * Expression immediately before the innermost `(` before the cursor (e.g. `foo`, `Storage.add`).
 */
export function extractCalleeBeforeOpenParen(
  textBeforeCursorText: string,
  openParenIdx?: number
): string | null {
  const idx = openParenIdx ?? textBeforeCursorText.lastIndexOf("(");
  if (idx < 0) return null;
  const beforeParen = textBeforeCursorText.slice(0, idx);
  const compact = beforeParen.replace(/\s+/g, " ").trimEnd();
  const m = compact.match(/([\w.]+)\s*$/);
  return m?.[1] ?? null;
}

/** Find the opening `(` of the active (currently unclosed) call before the cursor. */
function findActiveCallOpenParen(textBeforeCursorText: string): number {
  const opens = findActiveCallOpenParens(textBeforeCursorText);
  return opens.length > 0 ? opens[opens.length - 1]! : -1;
}

/** All currently-unclosed call parens before the cursor (outer -> inner). */
function findActiveCallOpenParens(textBeforeCursorText: string): number[] {
  const openStack: number[] = [];
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < textBeforeCursorText.length; i++) {
    const ch = textBeforeCursorText[i]!;
    const prev = i > 0 ? textBeforeCursorText[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      openStack.push(i);
    } else if (ch === ")") {
      if (openStack.length > 0) openStack.pop();
    }
  }

  return openStack;
}

/** Comma index at paren depth 0 between the opening `(` and the cursor. */
export function activeParameterAfterOpen(textFromOpenParenToCursor: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: '"' | "'" | null = null;
  let commas = 0;

  for (let i = 0; i < textFromOpenParenToCursor.length; i++) {
    const ch = textFromOpenParenToCursor[i]!;
    const prev = i > 0 ? textFromOpenParenToCursor[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) commas++;
  }

  return commas;
}

function splitTopLevelCommaSeparated(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1] : "";
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
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

interface ParsedParam {
  name: string | null;
  kind: "positionalOnly" | "positionalOrKeyword" | "vararg" | "keywordOnly" | "kwargs";
}

function parseSignatureParamNames(sig: string): ParsedParam[] {
  const open = sig.indexOf("(");
  const close = sig.lastIndexOf(")");
  if (open < 0 || close <= open) return [];
  const rawParams = splitTopLevelCommaSeparated(sig.slice(open + 1, close));
  const out: ParsedParam[] = [];
  let keywordOnly = false;

  for (const raw of rawParams) {
    const p = raw.trim();
    if (!p) continue;
    if (p === "/") {
      for (const existing of out) {
        if (existing.kind === "positionalOrKeyword") existing.kind = "positionalOnly";
      }
      continue;
    }
    if (p === "*") {
      keywordOnly = true;
      continue;
    }
    if (p.startsWith("**")) {
      const n = p.slice(2).split(/[:=\s]/, 1)[0] ?? "";
      out.push({ name: n || null, kind: "kwargs" });
      continue;
    }
    if (p.startsWith("*")) {
      const n = p.slice(1).split(/[:=\s]/, 1)[0] ?? "";
      out.push({ name: n || null, kind: "vararg" });
      keywordOnly = true;
      continue;
    }
    const n = p.split(/[:=\s]/, 1)[0] ?? "";
    out.push({ name: n || null, kind: keywordOnly ? "keywordOnly" : "positionalOrKeyword" });
  }
  return out;
}

function topLevelKeywordName(arg: string): string | null {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote: '"' | "'" | null = null;
  const trimmed = arg.trimStart();
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    const prev = i > 0 ? trimmed[i - 1] : "";
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
    else if (ch === "=" && paren === 0 && bracket === 0 && brace === 0) {
      const lhs = trimmed.slice(0, i).trim();
      return /^[A-Za-z_]\w*$/.test(lhs) ? lhs : null;
    }
  }
  return null;
}

interface CallArgSegment {
  text: string;
  start: number;
  end: number;
}

function splitCallArgsWithOffsets(text: string, baseOffset: number): CallArgSegment[] {
  const out: CallArgSegment[] = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1] : "";
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
      out.push({ text: text.slice(start, i), start: baseOffset + start, end: baseOffset + i });
      start = i + 1;
    }
  }
  out.push({ text: text.slice(start), start: baseOffset + start, end: baseOffset + text.length });
  return out;
}

function keywordIntentAtCursor(argText: string, cursorInArg: number): string | null {
  const trimmedLeft = argText.match(/^\s*/)?.[0]?.length ?? 0;
  const trimmed = argText.slice(trimmedLeft);
  const m = trimmed.match(/^([A-Za-z_]\w*)/);
  if (!m?.[1]) return null;
  const name = m[1];
  const nameStart = trimmedLeft;
  const nameEnd = trimmedLeft + name.length;
  if (cursorInArg >= nameStart && cursorInArg <= nameEnd) return name;
  const afterName = argText.slice(nameEnd);
  const ws = afterName.match(/^\s*/)?.[0]?.length ?? 0;
  const eqPos = nameEnd + ws;
  if (argText[eqPos] === "=" && cursorInArg <= eqPos + 1) return name;
  return null;
}

function findFormalByName(params: ParsedParam[], name: string): number {
  return params.findIndex(
    (p) => p.name === name && p.kind !== "vararg" && p.kind !== "kwargs"
  );
}

function findNextPositionalFormal(params: ParsedParam[], positionalUsed: number): number {
  let seen = 0;
  for (let i = 0; i < params.length; i++) {
    const k = params[i]!.kind;
    if (k === "positionalOnly" || k === "positionalOrKeyword") {
      if (seen === positionalUsed) return i;
      seen++;
    }
  }
  const vararg = params.findIndex((p) => p.kind === "vararg");
  if (vararg >= 0) return vararg;
  return Math.max(0, params.length - 1);
}

function findMatchingCloseParen(text: string, openParenIdx: number): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let i = openParenIdx; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1] : "";
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function computeActiveParameterIndex(
  sig: string,
  callArgText: string,
  callArgStartOffset: number,
  cursorOffset: number
): number {
  const parsedParams = parseSignatureParamNames(sig);
  if (parsedParams.length === 0) return 0;

  const args = splitCallArgsWithOffsets(callArgText, callArgStartOffset);
  if (args.length === 0) return 0;

  let currentIdx = args.length - 1;
  for (let i = 0; i < args.length; i++) {
    const seg = args[i]!;
    if (cursorOffset >= seg.start && cursorOffset <= seg.end) {
      currentIdx = i;
      break;
    }
    if (cursorOffset < seg.start) {
      currentIdx = i;
      break;
    }
  }

  let positionalUsed = 0;
  for (let i = 0; i < currentIdx; i++) {
    const kw = topLevelKeywordName(args[i]!.text);
    if (!kw) positionalUsed++;
  }

  const current = args[currentIdx]!;
  const cursorInArg = Math.max(0, Math.min(current.text.length, cursorOffset - current.start));
  const kwNow = topLevelKeywordName(current.text) ?? keywordIntentAtCursor(current.text, cursorInArg);
  if (kwNow) {
    const named = findFormalByName(parsedParams, kwNow);
    if (named >= 0) return named;
    const kwargs = parsedParams.findIndex((p) => p.kind === "kwargs");
    if (kwargs >= 0) return kwargs;
  }

  return findNextPositionalFormal(parsedParams, positionalUsed);
}

/**
 * Parse parameters from a signature string and return ParameterInformation objects
 * with [start, end] labels for highlighting.
 */
function parseSignatureParameters(sig: string): vscode.ParameterInformation[] {
  // Find the opening paren in the signature
  const openParen = sig.indexOf("(");
  if (openParen < 0) return [];

  // Find the matching closing paren
  let depth = 0;
  let closeBracketDepth = 0;
  let closeBraceDepth = 0;
  let closeQuote: '"' | "'" | null = null;
  let closeParen = -1;
  for (let i = openParen; i < sig.length; i++) {
    const ch = sig[i]!;
    const prev = i > 0 ? sig[i - 1] : "";
    if (closeQuote) {
      if (ch === closeQuote && prev !== "\\") closeQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      closeQuote = ch;
      continue;
    }
    if (ch === "[") closeBracketDepth++;
    else if (ch === "]") closeBracketDepth = Math.max(0, closeBracketDepth - 1);
    else if (ch === "{") closeBraceDepth++;
    else if (ch === "}") closeBraceDepth = Math.max(0, closeBraceDepth - 1);
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0 && closeBracketDepth === 0 && closeBraceDepth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen < 0) closeParen = sig.length;

  const paramsStr = sig.slice(openParen + 1, closeParen);
  if (!paramsStr.trim()) return [];

  const params: vscode.ParameterInformation[] = [];
  let segmentStart = openParen + 1;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote: '"' | "'" | null = null;

  function pushTrimmedRange(rawStart: number, rawEndExclusive: number): void {
    let start = rawStart;
    let end = rawEndExclusive;
    while (start < end && /\s/.test(sig[start] ?? "")) start++;
    while (end > start && /\s/.test(sig[end - 1] ?? "")) end--;
    if (end > start) {
      params.push(new vscode.ParameterInformation([start, end]));
    }
  }

  for (let i = 0; i < paramsStr.length; i++) {
    const ch = paramsStr[i]!;
    const prev = i > 0 ? paramsStr[i - 1] : "";
    const absIdx = openParen + 1 + i;

    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      pushTrimmedRange(segmentStart, absIdx);
      segmentStart = absIdx + 1;
    }
  }

  // Last parameter (or only parameter).
  pushTrimmedRange(segmentStart, closeParen);

  return params;
}

function fallbackLocalCalleeLocation(
  document: vscode.TextDocument,
  callee: string,
  atLine: number
): { uri: vscode.Uri; line: number } | undefined {
  const symbols = scanQualifiedDefinitions(document.getText(), document.uri);
  let best:
    | {
        uri: vscode.Uri;
        line: number;
      }
    | undefined;
  for (const s of symbols) {
    if (s.line > atLine) continue;
    if (s.simpleName !== callee && s.qualifiedName !== callee) continue;
    if (!best || s.line > best.line) {
      best = { uri: document.uri, line: s.line };
    }
  }
  return best;
}

function fallbackIndexedCalleeLocation(
  projectIndex: ProjectIndex,
  document: vscode.TextDocument,
  callee: string,
  atLine: number
): { uri: vscode.Uri; line: number } | undefined {
  const qualified = projectIndex.getSymbolsByQualifiedName(callee);
  if (qualified.length > 0) {
    const first = qualified[0]!;
    return { uri: first.uri, line: first.line };
  }

  const candidates = projectIndex.getSymbolsBySimpleName(callee);
  if (candidates.length === 0) return undefined;

  // Prefer current file and closest previous definition line.
  let best = candidates[0]!;
  for (const c of candidates) {
    const bestSame = best.uri.fsPath === document.uri.fsPath;
    const currSame = c.uri.fsPath === document.uri.fsPath;
    if (currSame && !bestSame) {
      best = c;
      continue;
    }
    if (currSame && bestSame) {
      const bestDist = Math.abs(best.line - atLine);
      const currDist = Math.abs(c.line - atLine);
      if (currDist < bestDist) best = c;
      continue;
    }
    if (!bestSame && c.uri.fsPath === best.uri.fsPath) {
      const bestDist = Math.abs(best.line - atLine);
      const currDist = Math.abs(c.line - atLine);
      if (currDist < bestDist) best = c;
    }
  }

  return { uri: best.uri, line: best.line };
}

export function registerRenpySignatureHelp(
  projectIndex: ProjectIndex
): vscode.Disposable {
  return vscode.languages.registerSignatureHelpProvider(
    [{ language: "renpy" }, { language: "python" }],
    {
      async provideSignatureHelp(document, position) {
        if (!isRenpyFile(document)) return null;

        const fullText = document.getText();
        const cursorOffset = document.offsetAt(position);
        const before = fullText.slice(0, cursorOffset);
        const resolve = createMergedCrossRefResolver(projectIndex, document);
        const parenStack = findActiveCallOpenParens(before);
        if (parenStack.length === 0) return null;

        const signatures: vscode.SignatureInformation[] = [];
        let activeSignatureIdx = 0;
        let activeParamIdx = 0;

        for (let i = 0; i < parenStack.length; i++) {
          const parenIdx = parenStack[i]!;
          const callee = extractCalleeBeforeOpenParen(before, parenIdx);
          if (!callee) continue;

          const loc =
            resolve(callee) ??
            fallbackLocalCalleeLocation(document, callee, position.line) ??
            fallbackIndexedCalleeLocation(projectIndex, document, callee, position.line);
          if (!loc) continue;

          const targetDoc =
            loc.uri.toString() === document.uri.toString()
              ? document
              : await vscode.workspace.openTextDocument(loc.uri);
          const lines = targetDoc.getText().split(/\r?\n/);
          const sig = extractDefinitionSignature(lines, loc.line);
          if (!sig) continue;

          const closeParenIdx = findMatchingCloseParen(fullText, parenIdx);
          const callArgEnd = closeParenIdx >= 0 ? closeParenIdx : cursorOffset;
          const callArgText = fullText.slice(parenIdx + 1, callArgEnd);
          const paramIdx = computeActiveParameterIndex(sig, callArgText, parenIdx + 1, cursorOffset);

          const information = new vscode.SignatureInformation(sig);
          information.parameters = parseSignatureParameters(sig);
          signatures.push(information);

          // Last unclosed call is the currently focused one.
          if (i === parenStack.length - 1) {
            activeSignatureIdx = signatures.length - 1;
            activeParamIdx = paramIdx;
          }
        }

        if (signatures.length === 0) return null;

        const help = new vscode.SignatureHelp();
        help.signatures = signatures;
        help.activeSignature = Math.max(0, activeSignatureIdx);
        help.activeParameter = activeParamIdx;

        return help;
      },
    },
    "(",
    ","
  );
}
