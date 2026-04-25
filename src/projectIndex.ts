import * as vscode from "vscode";
import type { IndexedSymbol } from "./qualifiedDefinitions";
import { scanQualifiedDefinitions } from "./qualifiedDefinitions";
import type { AssignmentRhsHint } from "./receiverInference";
import { scanAssignmentHints } from "./receiverInference";

const EXCLUDE = "**/{node_modules,.git,.venv,venv}/**";

/** Kinds that are plain assignments / Ren'Py store slots (ambiguous duplicate simple names). */
const ASSIGNMENT_LIKE_KINDS = new Set<IndexedSymbol["kind"]>([
  "variable",
  "variable_local",
  "define",
  "default",
]);

function pickAmbiguousAssignmentSymbols(hits: IndexedSymbol[]): IndexedSymbol {
  const dd = hits.filter((s) => s.kind === "define" || s.kind === "default");
  if (dd.length === 1) return dd[0]!;
  hits.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath) || a.line - b.line);
  return hits[0]!;
}

function pushSym(map: Map<string, IndexedSymbol[]>, key: string, s: IndexedSymbol): void {
  const arr = map.get(key) ?? [];
  arr.push(s);
  map.set(key, arr);
}

function removeSym(map: Map<string, IndexedSymbol[]>, key: string, s: IndexedSymbol): void {
  const arr = map.get(key);
  if (!arr) return;
  const next = arr.filter((x) => !(x.uri.fsPath === s.uri.fsPath && x.line === s.line && x.qualifiedName === s.qualifiedName));
  if (next.length === 0) map.delete(key);
  else map.set(key, next);
}

export class ProjectIndex {
  private readonly byQualified = new Map<string, IndexedSymbol[]>();
  private readonly bySimple = new Map<string, IndexedSymbol[]>();
  private readonly byFile = new Map<string, IndexedSymbol[]>();
  private readonly assignmentHintsByFile = new Map<string, AssignmentRhsHint[]>();

  updateFileContent(uri: vscode.Uri, text: string): void {
    this.removeFile(uri);
    const lines = text.split(/\r?\n/);
    this.assignmentHintsByFile.set(uri.fsPath, scanAssignmentHints(lines, uri));
    const symbols = scanQualifiedDefinitions(text, uri);
    this.byFile.set(uri.fsPath, symbols);
    for (const s of symbols) {
      pushSym(this.byQualified, s.qualifiedName, s);
      pushSym(this.bySimple, s.simpleName, s);
    }
  }

  removeFile(uri: vscode.Uri): void {
    const path = uri.fsPath;
    this.assignmentHintsByFile.delete(path);
    const prev = this.byFile.get(path);
    if (!prev?.length) {
      this.byFile.delete(path);
      return;
    }
    for (const s of prev) {
      removeSym(this.byQualified, s.qualifiedName, s);
      removeSym(this.bySimple, s.simpleName, s);
    }
    this.byFile.delete(path);
  }

  /**
   * 1) Qualified name (FragmentStorage.add_event) — unique in project
   * 2) Simple name only if exactly one match workspace-wide
   */
  resolve(name: string): IndexedSymbol | undefined {
    const qList = this.byQualified.get(name);
    if (qList?.length === 1) return qList[0];
    if (qList && qList.length > 1) return undefined;

    const sList = this.bySimple.get(name);
    if (sList?.length === 1) return sList[0];
    return undefined;
  }

  /**
   * All symbols from other `.rpy` / `.rpym` files in the index (not the live buffer).
   * Omits `variable_local` (`$` lines): those stay file-local only.
   */
  /**
   * Assignment lines from indexed files other than `excludeFsPath` (saved disk content).
   * The active document’s live buffer hints are merged by the caller.
   */
  assignmentHintsExceptCurrentFile(excludeFsPath: string): AssignmentRhsHint[] {
    const out: AssignmentRhsHint[] = [];
    for (const [p, h] of this.assignmentHintsByFile.entries()) {
      if (p === excludeFsPath) continue;
      out.push(...h);
    }
    return out;
  }

  symbolsExceptCurrentFile(excludeFsPath: string): IndexedSymbol[] {
    const out: IndexedSymbol[] = [];
    for (const [p, syms] of this.byFile.entries()) {
      if (p === excludeFsPath) continue;
      for (const s of syms) {
        if (s.kind === "variable_local") continue;
        out.push(s);
      }
    }
    return out;
  }

  /**
   * Resolve like {@link resolve}, but:
   * - `$` script locals (`variable_local`) only match in `currentUri`’s file.
   * - Multiple simple-name hits: if all are assignment-like (`variable` / `define` / `default`),
   *   pick one (`define`/`default` preferred, else earliest path+line). Otherwise keep ambiguous → `undefined`.
   */
  resolveForDocument(name: string, currentUri: vscode.Uri): IndexedSymbol | undefined {
    const qList = this.byQualified.get(name);
    if (qList?.length === 1) return qList[0];
    if (qList && qList.length > 1) return undefined;

    const raw = this.bySimple.get(name) ?? [];
    const hits = raw.filter(
      (s) => s.kind !== "variable_local" || s.uri.fsPath === currentUri.fsPath
    );
    if (hits.length === 0) return undefined;
    if (hits.length === 1) return hits[0];

    const nonAssignment = hits.filter((s) => !ASSIGNMENT_LIKE_KINDS.has(s.kind));
    if (nonAssignment.length > 0) return undefined;

    return pickAmbiguousAssignmentSymbols(hits);
  }

  getSymbolsForFile(uri: vscode.Uri): IndexedSymbol[] {
    return this.byFile.get(uri.fsPath) ?? [];
  }

  getSymbolsBySimpleName(name: string): IndexedSymbol[] {
    return this.bySimple.get(name) ?? [];
  }

  getSymbolsByQualifiedName(name: string): IndexedSymbol[] {
    return this.byQualified.get(name) ?? [];
  }

  createCrossRefResolver(): (name: string) => { uri: vscode.Uri; line: number } | undefined {
    return (name: string) => {
      const s = this.resolve(name);
      if (!s) return undefined;
      return { uri: s.uri, line: s.line };
    };
  }

  async indexWorkspace(): Promise<void> {
    const [rpy, rpym] = await Promise.all([
      vscode.workspace.findFiles("**/*.rpy", EXCLUDE, 10000),
      vscode.workspace.findFiles("**/*.rpym", EXCLUDE, 10000),
    ]);
    const files = [...rpy, ...rpym];
    for (const uri of files) {
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder("utf-8").decode(buf);
        this.updateFileContent(uri, text);
      } catch {
        /* unreadable */
      }
    }
  }

  registerListeners(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (!this.isTarget(doc.uri)) return;
        this.updateFileContent(doc.uri, doc.getText());
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!this.isTarget(doc.uri)) return;
        this.updateFileContent(doc.uri, doc.getText());
      })
    );
    context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles((e) => {
        for (const f of e.files) {
          if (this.isTarget(f)) this.removeFile(f);
        }
      })
    );
  }

  private isTarget(uri: vscode.Uri): boolean {
    const p = uri.fsPath.replace(/\\/g, "/").toLowerCase();
    return p.endsWith(".rpy") || p.endsWith(".rpym");
  }
}
