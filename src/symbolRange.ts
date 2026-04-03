import * as vscode from "vscode";

const IDENT = /[\w$.]/;

/** Expand left/right to a dotted Python/Ren'Py identifier (e.g. renpy.music.play). */
export function wordRangeAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Range | null {
  const line = document.lineAt(position.line).text;
  let start = position.character;
  let end = position.character;

  if (start >= line.length || !IDENT.test(line[start]!)) {
    if (start > 0 && IDENT.test(line[start - 1]!)) start -= 1;
    else return null;
  }

  while (start > 0 && IDENT.test(line[start - 1]!)) start--;
  while (end < line.length && IDENT.test(line[end]!)) end++;

  if (start >= end) return null;
  const text = line.slice(start, end);
  if (!/[\w]/.test(text)) return null;

  return new vscode.Range(position.line, start, position.line, end);
}

export function isRenpyFile(document: vscode.TextDocument): boolean {
  const fsPath = document.uri.fsPath.replace(/\\/g, "/").toLowerCase();
  return fsPath.endsWith(".rpy") || fsPath.endsWith(".rpym");
}
