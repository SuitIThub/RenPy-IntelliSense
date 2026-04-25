import * as vscode from "vscode";
import { createMergedCrossRefResolver } from "./crossRefResolver";
import { extractDefinitionSignature } from "./definitionSignature";
import type { ProjectIndex } from "./projectIndex";
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
export function extractCalleeBeforeOpenParen(textBeforeCursorText: string): string | null {
  const idx = textBeforeCursorText.lastIndexOf("(");
  if (idx < 0) return null;
  const beforeParen = textBeforeCursorText.slice(0, idx);
  const compact = beforeParen.replace(/\s+/g, " ").trimEnd();
  const m = compact.match(/([\w.]+)\s*$/);
  return m?.[1] ?? null;
}

/** Comma index at paren depth 0 between the opening `(` and the cursor. */
export function activeParameterAfterOpen(textFromOpenParenToCursor: string): number {
  let depth = 0;
  let commas = 0;
  for (const ch of textFromOpenParenToCursor) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) commas++;
  }
  return commas;
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
  let closeParen = -1;
  for (let i = openParen; i < sig.length; i++) {
    if (sig[i] === "(") depth++;
    else if (sig[i] === ")") {
      depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen < 0) closeParen = sig.length;

  const paramsStr = sig.slice(openParen + 1, closeParen);
  if (!paramsStr.trim()) return [];

  const params: vscode.ParameterInformation[] = [];
  let currentStart = openParen + 1;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < paramsStr.length; i++) {
    const ch = paramsStr[i]!;
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      // End of a parameter
      const paramEnd = openParen + 1 + i;
      const paramText = sig.slice(currentStart, paramEnd).trim();
      if (paramText) {
        // Find actual start/end in the signature (trimmed positions)
        const actualStart = sig.indexOf(paramText, currentStart);
        params.push(new vscode.ParameterInformation([actualStart, actualStart + paramText.length]));
      }
      currentStart = openParen + 1 + i + 1; // Skip the comma
    }
  }

  // Last parameter (or only parameter)
  const lastParam = paramsStr.slice(currentStart - openParen - 1).trim();
  if (lastParam) {
    const actualStart = sig.indexOf(lastParam, currentStart);
    params.push(new vscode.ParameterInformation([actualStart, actualStart + lastParam.length]));
  }

  return params;
}

export function registerRenpySignatureHelp(projectIndex: ProjectIndex): vscode.Disposable {
  return vscode.languages.registerSignatureHelpProvider(
    [{ language: "renpy" }, { language: "python" }],
    {
      async provideSignatureHelp(document, position) {
        if (!isRenpyFile(document)) return null;

        const before = textBeforeCursor(document, position);
        const parenIdx = before.lastIndexOf("(");
        if (parenIdx < 0) return null;

        const callee = extractCalleeBeforeOpenParen(before);
        if (!callee) return null;

        const resolve = createMergedCrossRefResolver(projectIndex, document);
        const loc = resolve(callee);
        if (!loc) return null;

        const targetDoc =
          loc.uri.toString() === document.uri.toString()
            ? document
            : await vscode.workspace.openTextDocument(loc.uri);

        const lines = targetDoc.getText().split(/\r?\n/);
        const sig = extractDefinitionSignature(lines, loc.line);
        if (!sig) return null;

        const afterOpen = before.slice(parenIdx + 1);
        const paramIdx = activeParameterAfterOpen(afterOpen);

        const information = new vscode.SignatureInformation(sig);
        information.parameters = parseSignatureParameters(sig);

        const help = new vscode.SignatureHelp();
        help.signatures = [information];
        help.activeSignature = 0;
        help.activeParameter = paramIdx;

        return help;
      },
    },
    "(",
    ","
  );
}
