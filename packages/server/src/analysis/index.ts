/**
 * Project-wide symbol index for the Ren'Py Language Server.
 * Maintains maps of qualified and simple names for cross-file resolution.
 */

import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { IndexedSymbol, AssignmentRhsHint, EXCLUDE_PATTERN } from "@renpy-intellisense/shared";
import { scanQualifiedDefinitions } from "./scanner";
import { scanAssignmentHints } from "./inference";

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
  hits.sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line);
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
  const next = arr.filter((x) => !(x.uri === s.uri && x.line === s.line && x.qualifiedName === s.qualifiedName));
  if (next.length === 0) map.delete(key);
  else map.set(key, next);
}

export class ProjectIndex {
  private readonly byQualified = new Map<string, IndexedSymbol[]>();
  private readonly bySimple = new Map<string, IndexedSymbol[]>();
  private readonly byFile = new Map<string, IndexedSymbol[]>();
  private readonly assignmentHintsByFile = new Map<string, AssignmentRhsHint[]>();

  updateFileContent(uri: string, text: string): void {
    this.removeFile(uri);
    const lines = text.split(/\r?\n/);
    this.assignmentHintsByFile.set(uri, scanAssignmentHints(lines, uri));
    const symbols = scanQualifiedDefinitions(text, uri);
    this.byFile.set(uri, symbols);
    for (const s of symbols) {
      pushSym(this.byQualified, s.qualifiedName, s);
      pushSym(this.bySimple, s.simpleName, s);
    }
  }

  removeFile(uri: string): void {
    this.assignmentHintsByFile.delete(uri);
    const prev = this.byFile.get(uri);
    if (!prev?.length) {
      this.byFile.delete(uri);
      return;
    }
    for (const s of prev) {
      removeSym(this.byQualified, s.qualifiedName, s);
      removeSym(this.bySimple, s.simpleName, s);
    }
    this.byFile.delete(uri);
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
   * Assignment lines from indexed files other than `excludeUri` (saved disk content).
   * The active document's live buffer hints are merged by the caller.
   */
  assignmentHintsExceptCurrentFile(excludeUri: string): AssignmentRhsHint[] {
    const out: AssignmentRhsHint[] = [];
    for (const [p, h] of this.assignmentHintsByFile.entries()) {
      if (p === excludeUri) continue;
      out.push(...h);
    }
    return out;
  }

  /**
   * All symbols from other `.rpy` / `.rpym` files in the index (not the live buffer).
   * Omits `variable_local` (`$` lines): those stay file-local only.
   */
  symbolsExceptCurrentFile(excludeUri: string): IndexedSymbol[] {
    const out: IndexedSymbol[] = [];
    for (const [p, syms] of this.byFile.entries()) {
      if (p === excludeUri) continue;
      for (const s of syms) {
        if (s.kind === "variable_local") continue;
        out.push(s);
      }
    }
    return out;
  }

  /**
   * Resolve like {@link resolve}, but:
   * - `$` script locals (`variable_local`) only match in `currentUri`'s file.
   * - Multiple simple-name hits: if all are assignment-like (`variable` / `define` / `default`),
   *   pick one (`define`/`default` preferred, else earliest path+line). Otherwise keep ambiguous → `undefined`.
   */
  resolveForDocument(name: string, currentUri: string): IndexedSymbol | undefined {
    const qList = this.byQualified.get(name);
    if (qList?.length === 1) return qList[0];
    if (qList && qList.length > 1) return undefined;

    const raw = this.bySimple.get(name) ?? [];
    const hits = raw.filter(
      (s) => s.kind !== "variable_local" || s.uri === currentUri
    );
    if (hits.length === 0) return undefined;
    if (hits.length === 1) return hits[0];

    const nonAssignment = hits.filter((s) => !ASSIGNMENT_LIKE_KINDS.has(s.kind));
    if (nonAssignment.length > 0) return undefined;

    return pickAmbiguousAssignmentSymbols(hits);
  }

  getSymbolsForFile(uri: string): IndexedSymbol[] {
    return this.byFile.get(uri) ?? [];
  }

  getSymbolsBySimpleName(name: string): IndexedSymbol[] {
    return this.bySimple.get(name) ?? [];
  }

  getSymbolsByQualifiedName(name: string): IndexedSymbol[] {
    return this.byQualified.get(name) ?? [];
  }

  getAllSymbols(): IndexedSymbol[] {
    const out: IndexedSymbol[] = [];
    for (const syms of this.byFile.values()) {
      out.push(...syms);
    }
    return out;
  }

  createCrossRefResolver(): (name: string) => { uri: string; line: number } | undefined {
    return (name: string) => {
      const s = this.resolve(name);
      if (!s) return undefined;
      return { uri: s.uri, line: s.line };
    };
  }

  async indexWorkspaceFolder(folderUri: string): Promise<void> {
    const folderPath = URI.parse(folderUri).fsPath;
    await this.indexDirectory(folderPath);
  }

  private async indexDirectory(dirPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        // Skip excluded directories
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || 
              entry.name === ".venv" || entry.name === "venv") {
            continue;
          }
          await this.indexDirectory(fullPath);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (lower.endsWith(".rpy") || lower.endsWith(".rpym")) {
            try {
              const text = fs.readFileSync(fullPath, "utf8");
              const uri = URI.file(fullPath).toString();
              this.updateFileContent(uri, text);
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
}
