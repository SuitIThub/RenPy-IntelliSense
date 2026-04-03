import * as vscode from "vscode";
import type { IndexedSymbol } from "./qualifiedDefinitions";
import { scanQualifiedDefinitions } from "./qualifiedDefinitions";

const EXCLUDE = "**/{node_modules,.git,.venv,venv}/**";

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

  updateFileContent(uri: vscode.Uri, text: string): void {
    this.removeFile(uri);
    const symbols = scanQualifiedDefinitions(text, uri);
    this.byFile.set(uri.fsPath, symbols);
    for (const s of symbols) {
      pushSym(this.byQualified, s.qualifiedName, s);
      pushSym(this.bySimple, s.simpleName, s);
    }
  }

  removeFile(uri: vscode.Uri): void {
    const path = uri.fsPath;
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

  getSymbolsForFile(uri: vscode.Uri): IndexedSymbol[] {
    return this.byFile.get(uri.fsPath) ?? [];
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
