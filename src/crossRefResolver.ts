import * as vscode from "vscode";
import type { DefKind } from "./localDefinitions";
import type { ProjectIndex } from "./projectIndex";
import type { IndexedSymbol } from "./qualifiedDefinitions";
import { scanQualifiedDefinitions } from "./qualifiedDefinitions";

export type CrossRefLocation = { uri: vscode.Uri; line: number; kind?: DefKind };

function resolveInSymbolList(symbols: IndexedSymbol[], name: string): IndexedSymbol | undefined {
  const exact = symbols.find((s) => s.qualifiedName === name);
  if (exact) return exact;
  const hits = symbols.filter((s) => s.simpleName === name);
  if (hits.length === 1) return hits[0];
  return undefined;
}

/**
 * Prefer the live buffer for the active document (unsaved edits), then the workspace index
 * (other files and saved copies).
 */
export function createMergedCrossRefResolver(
  projectIndex: ProjectIndex,
  document: vscode.TextDocument
): (name: string) => CrossRefLocation | undefined {
  return (name: string) => {
    const live = scanQualifiedDefinitions(document.getText(), document.uri);
    const fromLive = resolveInSymbolList(live, name);
    if (fromLive) return { uri: document.uri, line: fromLive.line, kind: fromLive.kind };

    const g = projectIndex.resolveForDocument(name, document.uri);
    if (g) return { uri: g.uri, line: g.line, kind: g.kind };
    return undefined;
  };
}
