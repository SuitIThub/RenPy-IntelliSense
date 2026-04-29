import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { createMergedCrossRefResolver } from "./crossRefResolver";
import { extractDefinitionSignature } from "./definitionSignature";
import { formatDocstringToMarkdown } from "./docstringFormat";
import { getIndexKeys } from "./docIndexKeys";
import { EXTRA_DOC_LINKS } from "./extraLinks";
import type { ProjectIndex } from "./projectIndex";
import { scanQualifiedDefinitions } from "./qualifiedDefinitions";
import { isRenpyFile } from "./symbolRange";
import { RENPY_DOCUMENT_SELECTOR } from "./documentSelector";
import { ALL_ATL_KEYWORDS, type AtlKeyword } from "./atlKeywords";
import { ALL_SCREEN_KEYWORDS, SCREEN_ACTIONS, type ScreenKeyword } from "./screenKeywords";

function getLinesForIndexedUri(
  uri: vscode.Uri,
  currentDoc: vscode.TextDocument,
  currentLines: string[]
): string[] {
  if (uri.fsPath === currentDoc.uri.fsPath) return currentLines;
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
  if (open) return open.getText().split(/\r?\n/);
  try {
    return fs.readFileSync(uri.fsPath, "utf8").split(/\r?\n/);
  } catch {
    return currentLines;
  }
}

function loadUrlMap(): Record<string, string> {
  const p = path.join(__dirname, "..", "data", "doc-index.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Detect if cursor is inside a transform/ATL block.
 */
function isInAtlContext(document: vscode.TextDocument, position: vscode.Position): boolean {
  for (let i = position.line; i >= 0; i--) {
    const line = document.lineAt(i).text;
    if (/^\s*transform\s+\w+/.test(line)) return true;
    if (/^\s*at\s+\w+/.test(line)) return true;
    if (/^\s*show\s+/.test(line) && i === position.line) return false;
    if (/^\s*(screen|label|def|class)\s+/.test(line)) return false;
    if (i < position.line && /^\S/.test(line)) return false;
  }
  return false;
}

/**
 * Detect if cursor is inside a screen block.
 */
function isInScreenContext(document: vscode.TextDocument, position: vscode.Position): boolean {
  for (let i = position.line; i >= 0; i--) {
    const line = document.lineAt(i).text;
    if (/^\s*screen\s+\w+/.test(line)) return true;
    if (/^\s*(label|def|class|transform)\s+/.test(line) && !/^\s*screen/.test(line)) return false;
    if (i < position.line && /^\S/.test(line) && !/^\s*screen/.test(line)) return false;
  }
  return false;
}

/**
 * Extract persistent variable references from document text.
 */
function extractPersistentVariables(text: string): Set<string> {
  const vars = new Set<string>();
  const re = /\bpersistent\.(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    vars.add(`persistent.${match[1]}`);
  }
  return vars;
}

function atlKeywordToCompletionItem(kw: AtlKeyword): vscode.CompletionItem {
  const item = new vscode.CompletionItem(kw.name, vscode.CompletionItemKind.Property);
  if (kw.kind === "warper") {
    item.kind = vscode.CompletionItemKind.Function;
    item.detail = "ATL warper";
  } else if (kw.kind === "statement") {
    item.kind = vscode.CompletionItemKind.Keyword;
    item.detail = "ATL statement";
  } else {
    item.detail = "ATL property";
  }
  item.documentation = new vscode.MarkdownString(kw.documentation);
  if (kw.snippet) {
    item.insertText = new vscode.SnippetString(kw.snippet);
  }
  return item;
}

function screenKeywordToCompletionItem(kw: ScreenKeyword): vscode.CompletionItem {
  let kind: vscode.CompletionItemKind;
  let detail: string;
  switch (kw.kind) {
    case "displayable":
      kind = vscode.CompletionItemKind.Class;
      detail = "Screen displayable";
      break;
    case "property":
      kind = vscode.CompletionItemKind.Property;
      detail = "Screen property";
      break;
    case "action":
      kind = vscode.CompletionItemKind.Function;
      detail = "Screen action";
      break;
    case "statement":
      kind = vscode.CompletionItemKind.Keyword;
      detail = "Screen statement";
      break;
    default:
      kind = vscode.CompletionItemKind.Text;
      detail = "Screen";
  }
  const item = new vscode.CompletionItem(kw.name, kind);
  item.detail = detail;
  item.documentation = new vscode.MarkdownString(kw.documentation);
  if (kw.snippet) {
    item.insertText = new vscode.SnippetString(kw.snippet);
  }
  return item;
}

export function registerRenpyDocCompletions(projectIndex: ProjectIndex): vscode.Disposable {
  const urlMap = loadUrlMap();
  const extraKeys = Object.keys(EXTRA_DOC_LINKS);

  const provider = vscode.languages.registerCompletionItemProvider(
    RENPY_DOCUMENT_SELECTOR,
    {
      provideCompletionItems(document, position) {
        if (!isRenpyFile(document)) return undefined;

        const line = document.lineAt(position.line).text;
        const before = line.slice(0, position.character);
        const m = before.match(/[\w.$]+$/);
        const partial = m ? m[0] : "";
        
        const results: vscode.CompletionItem[] = [];
        const pl = partial.toLowerCase();

        // Check for persistent. prefix - provide known persistent vars
        if (before.endsWith("persistent.") || partial.startsWith("persistent.")) {
          const docText = document.getText();
          const persistentVars = extractPersistentVariables(docText);
          
          // Also scan all open documents for persistent vars
          for (const doc of vscode.workspace.textDocuments) {
            if (isRenpyFile(doc)) {
              for (const v of extractPersistentVariables(doc.getText())) {
                persistentVars.add(v);
              }
            }
          }
          
          for (const v of persistentVars) {
            const shortName = v.replace("persistent.", "");
            if (shortName.toLowerCase().startsWith(pl.replace("persistent.", ""))) {
              const item = new vscode.CompletionItem(shortName, vscode.CompletionItemKind.Variable);
              item.detail = "Persistent variable";
              item.documentation = new vscode.MarkdownString(`Persistent variable \`${v}\``);
              results.push(item);
            }
          }
          return results;
        }

        if (partial.length < 1) return undefined;

        // Check context for ATL/Screen completions
        const inAtl = isInAtlContext(document, position);
        const inScreen = isInScreenContext(document, position);

        // Add ATL keywords if in ATL context
        if (inAtl) {
          for (const kw of ALL_ATL_KEYWORDS) {
            if (kw.name.toLowerCase().startsWith(pl)) {
              results.push(atlKeywordToCompletionItem(kw));
            }
          }
        }

        // Add screen keywords if in screen context
        if (inScreen) {
          for (const kw of ALL_SCREEN_KEYWORDS) {
            if (kw.name.toLowerCase().startsWith(pl)) {
              results.push(screenKeywordToCompletionItem(kw));
            }
          }
        }

        // Always provide screen actions (they can be used anywhere with action=)
        if (/\baction\s*$/.test(before) || /\baction\s+[\w.]*$/.test(before)) {
          for (const kw of SCREEN_ACTIONS) {
            if (kw.name.toLowerCase().startsWith(pl)) {
              results.push(screenKeywordToCompletionItem(kw));
            }
          }
        }

        const indexKeys = getIndexKeys();
        const matched = new Set<string>();

        const docText = document.getText();
        const linesSplit = docText.split(/\r?\n/);
        const localSyms = [
          ...scanQualifiedDefinitions(docText, document.uri),
          ...projectIndex.symbolsExceptCurrentFile(document.uri.fsPath),
        ];
        const resolveCrossRef = createMergedCrossRefResolver(projectIndex, document);

        for (const d of localSyms) {
          if (d.qualifiedName.toLowerCase().startsWith(pl)) matched.add(d.qualifiedName);
          if (d.simpleName.toLowerCase().startsWith(pl)) matched.add(d.simpleName);
        }

        for (const k of extraKeys) {
          if (k.toLowerCase().startsWith(pl)) matched.add(k);
        }
        for (const k of indexKeys) {
          if (k.toLowerCase().startsWith(pl)) matched.add(k);
        }

        const uniq = [...matched].sort((a, b) => a.length - b.length).slice(0, 150);

        for (const name of uniq) {
          const url = urlMap[name] ?? EXTRA_DOC_LINKS[name];
          const local = localSyms.find((d) => d.qualifiedName === name || d.simpleName === name);
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
          if (local) {
            item.kind = vscode.CompletionItemKind.Function;
            const sigLines = getLinesForIndexedUri(local.uri, document, linesSplit);
            const sig = extractDefinitionSignature(sigLines, local.line, local.kind);
            const parts: string[] = [];
            if (sig) parts.push(["```python", sig, "```"].join("\n"));
            const ds = local.docstring?.trim();
            // Determine enclosing class for cross-ref resolution
            let enclosingClass: string | null = null;
            if (local.kind === "class") {
              enclosingClass = local.qualifiedName;
            } else if (local.qualifiedName.includes(".")) {
              const dot = local.qualifiedName.lastIndexOf(".");
              enclosingClass = local.qualifiedName.slice(0, dot);
            }
            if (ds) parts.push(formatDocstringToMarkdown(ds, { resolveCrossRef, enclosingClass }));
            const doc = new vscode.MarkdownString(parts.join("\n\n"));
            doc.isTrusted = true;
            if (url) doc.appendMarkdown(`${parts.length ? "\n\n" : ""}[Ren'Py documentation](${url})`);
            item.documentation = doc;
            item.detail = ds ? "Local docstring" : "Local definition";
          } else {
            item.detail = "Ren'Py documentation";
            if (url) {
              const doc = new vscode.MarkdownString(`[Open documentation](${url})`);
              doc.isTrusted = true;
              item.documentation = doc;
            }
          }
          results.push(item);
        }

        return results;
      },
    },
    ".",
    "$"
  );

  return provider;
}
