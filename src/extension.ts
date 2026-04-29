import * as vscode from "vscode";
import { createMergedCrossRefResolver } from "./crossRefResolver";
import { registerRenpyDocCompletions } from "./completions";
import { loadDocExcerpt } from "./docExcerpt";
import {
  OPEN_DEFINITION_COMMAND,
  escapeMarkdownLinkLabel,
  formatDocstringToMarkdown,
  makeOpenDefinitionCommandLink,
} from "./docstringFormat";
import { extractDefinitionSignature } from "./definitionSignature";
import { definitionForSymbolAtLine, type LocalDefinition } from "./localDefinitions";
import { ProjectIndex } from "./projectIndex";
import {
  indexedSymbolsToLocalDefinitions,
  indexedToLocalName,
  scanQualifiedDefinitions,
  type IndexedSymbol,
} from "./qualifiedDefinitions";
import { findEnclosingClassContext, resolveIndexedSymbolForHover } from "./hoverResolve";
import { collectReceiverInferenceContext } from "./receiverInference";
import { resolveDocUrl, searchFallbackUrl } from "./resolveDocUrl";
import { registerRenpySignatureHelp } from "./signatureHelp";
import { isRenpyFile, wordRangeAtPosition } from "./symbolRange";
import { RENPY_DOCUMENT_SELECTOR } from "./documentSelector";
import { applyRecommendedWorkspaceSettings } from "./workspaceSetup";

function makeLru<K, V>(maxSize: number): {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
} {
  const m = new Map<K, V>();
  return {
    get(key: K): V | undefined {
      const v = m.get(key);
      if (v === undefined) return undefined;
      m.delete(key);
      m.set(key, v);
      return v;
    },
    set(key: K, value: V): void {
      if (maxSize <= 0) return;
      if (m.has(key)) m.delete(key);
      m.set(key, value);
      while (m.size > maxSize) {
        const first = m.keys().next().value as K;
        m.delete(first);
      }
    },
  };
}

let excerptCache = makeLru<string, string | null>(400);

function indexedSymbolToLocalDefinition(s: IndexedSymbol): LocalDefinition {
  return {
    name:
      s.kind === "def" || s.kind === "class" || s.kind === "label"
        ? s.qualifiedName
        : indexedToLocalName(s),
    kind: s.kind,
    line: s.line,
    docstring: s.docstring,
  };
}

function hoverKindLabel(def: LocalDefinition): string {
  if (def.kind === "def") return def.name.includes(".") ? "method" : "function";
  if (def.kind === "class") return "class";
  if (def.kind === "label") return "label";
  if (def.kind === "screen") return "screen";
  if (def.kind === "transform") return "transform";
  if (def.kind === "image") return "image";
  if (def.kind === "define") return "define";
  if (def.kind === "default") return "default";
  if (def.kind === "variable_local") return "local variable";
  return "variable";
}

function findIndexedSymbolAtLocation(
  symbols: IndexedSymbol[],
  uri: vscode.Uri,
  line: number,
  kind: LocalDefinition["kind"]
): IndexedSymbol | undefined {
  return symbols.find((s) => s.uri.fsPath === uri.fsPath && s.line === line && s.kind === kind);
}

function findBestClassSymbol(symbols: IndexedSymbol[], className: string): IndexedSymbol | undefined {
  const hits = symbols.filter((s) => s.kind === "class" && s.simpleName === className);
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath) || a.line - b.line);
  return hits[0];
}

function findBestLabelSymbol(
  symbols: IndexedSymbol[],
  qualifiedLabelName: string
): IndexedSymbol | undefined {
  const hits = symbols.filter((s) => s.kind === "label" && s.qualifiedName === qualifiedLabelName);
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath) || a.line - b.line);
  return hits[0];
}

function appendClassHierarchyMarkdown(
  md: vscode.MarkdownString,
  classSym: IndexedSymbol,
  symbols: IndexedSymbol[]
): void {
  const seen = new Set<string>();
  const chain: IndexedSymbol[] = [];
  let cur: IndexedSymbol | undefined = classSym;

  while (cur) {
    const key = `${cur.uri.fsPath}:${cur.line}:${cur.qualifiedName}`;
    if (seen.has(key)) break;
    seen.add(key);
    chain.push(cur);
    if (!cur.baseTypeHint) break;
    cur = findBestClassSymbol(symbols, cur.baseTypeHint);
  }

  if (chain.length <= 1) return;

  const parts = chain.map((s) => {
    const href = makeOpenDefinitionCommandLink(s.uri, s.line);
    const name = escapeMarkdownLinkLabel(s.simpleName);
    return `[${name}](${href})`;
  });
  md.appendMarkdown(`\n\n**Class hierarchy:** ${parts.join(" -> ")}\n`);
}

function appendLabelHierarchyMarkdown(
  md: vscode.MarkdownString,
  labelSym: IndexedSymbol,
  symbols: IndexedSymbol[]
): void {
  const seen = new Set<string>();
  const chain: IndexedSymbol[] = [];
  let cur: IndexedSymbol | undefined = labelSym;

  while (cur) {
    const key = `${cur.uri.fsPath}:${cur.line}:${cur.qualifiedName}`;
    if (seen.has(key)) break;
    seen.add(key);
    chain.push(cur);
    const parent =
      cur.parentLabelHint && cur.parentLabelHint.length > 0
        ? cur.parentLabelHint
        : cur.qualifiedName.includes(".")
          ? cur.qualifiedName.slice(0, cur.qualifiedName.lastIndexOf("."))
          : "";
    if (!parent) break;
    cur = findBestLabelSymbol(symbols, parent);
  }

  if (chain.length <= 1) return;

  const parts = chain.map((s) => {
    const href = makeOpenDefinitionCommandLink(s.uri, s.line);
    const name = escapeMarkdownLinkLabel(s.qualifiedName);
    return `[${name}](${href})`;
  });
  md.appendMarkdown(`\n\n**Label hierarchy:** ${parts.join(" -> ")}\n`);
}

function refreshCacheSize(): void {
  const n = vscode.workspace.getConfiguration("renpyDocHover").get<number>("cacheSize", 400);
  excerptCache = makeLru<string, string | null>(n);
}

export function activate(context: vscode.ExtensionContext): void {
  const projectIndex = new ProjectIndex();
  projectIndex.registerListeners(context);
  void projectIndex.indexWorkspace();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_DEFINITION_COMMAND,
      async (uriStr: unknown, line0: unknown) => {
        if (typeof uriStr !== "string" || typeof line0 !== "number") return;
        const uri = vscode.Uri.parse(uriStr);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(line0, 0, line0, 0),
          preview: false,
        });
      }
    ),
    vscode.commands.registerCommand("renpyDocHover.applyWorkspaceRecommendations", () =>
      void applyRecommendedWorkspaceSettings()
    )
  );

  refreshCacheSize();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("renpyDocHover.cacheSize")) refreshCacheSize();
    })
  );

  const hover = vscode.languages.registerHoverProvider(
    RENPY_DOCUMENT_SELECTOR,
    {
      async provideHover(document, position) {
        if (!isRenpyFile(document)) return null;

        const range = wordRangeAtPosition(document, position);
        if (!range) return null;

        const symbol = document.getText(range);
        const cfg = vscode.workspace.getConfiguration("renpyDocHover");
        const fetchOnline = cfg.get<boolean>("fetchOnline", true);
        const preferLocal = cfg.get<boolean>("preferLocalDocstring", true);
        const showOnlineWithLocal = cfg.get<boolean>("showOnlineDocsWithLocal", true);

        const fullText = document.getText();
        const liveIndexed = scanQualifiedDefinitions(fullText, document.uri);
        const mergedIndexed = [
          ...liveIndexed,
          ...projectIndex.symbolsExceptCurrentFile(document.uri.fsPath),
        ];
        const inferenceCtx = collectReceiverInferenceContext(
          document,
          fullText,
          projectIndex.assignmentHintsExceptCurrentFile(document.uri.fsPath),
          projectIndex.symbolsExceptCurrentFile(document.uri.fsPath)
        );
        const lineText = document.lineAt(position.line).text;
        const enclosingClass = findEnclosingClassContext(mergedIndexed, position.line, fullText);
        const memberHit = resolveIndexedSymbolForHover(
          mergedIndexed,
          lineText,
          range,
          position.line,
          { inference: inferenceCtx, enclosingClass }
        );

        let definitionUri = document.uri;
        let indexedDef: IndexedSymbol | undefined = memberHit;
        let localDef: LocalDefinition | null = memberHit
          ? indexedSymbolToLocalDefinition(memberHit)
          : definitionForSymbolAtLine(
              indexedSymbolsToLocalDefinitions(liveIndexed),
              symbol,
              position.line
            );
        if (memberHit) definitionUri = memberHit.uri;

        if (!indexedDef && localDef) {
          indexedDef = findIndexedSymbolAtLocation(
            liveIndexed,
            definitionUri,
            localDef.line,
            localDef.kind
          );
        }

        if (!localDef) {
          const ws = projectIndex.resolveForDocument(symbol, document.uri);
          if (ws) {
            localDef = indexedSymbolToLocalDefinition(ws);
            definitionUri = ws.uri;
            indexedDef = ws;
          }
        }

        const resolveCrossRef = createMergedCrossRefResolver(projectIndex, document);

        // Determine enclosing class for cross-reference resolution in docstrings
        // If viewing a class's docstring, refs like :func:`method` should resolve to ClassName.method
        // If viewing a method's docstring, refs should resolve to sibling methods in the same class
        let docstringClassContext: string | null = null;
        if (indexedDef?.kind === "class") {
          docstringClassContext = indexedDef.qualifiedName;
        } else if (indexedDef?.qualifiedName?.includes(".")) {
          const dot = indexedDef.qualifiedName.lastIndexOf(".");
          docstringClassContext = indexedDef.qualifiedName.slice(0, dot);
        }

        let localMd = "";
        let linesSplit = fullText.split(/\r?\n/);
        if (localDef && definitionUri.fsPath !== document.uri.fsPath) {
          const open = vscode.workspace.textDocuments.find(
            (d) => d.uri.fsPath === definitionUri.fsPath
          );
          if (open) {
            linesSplit = open.getText().split(/\r?\n/);
          } else {
            try {
              const otherDoc = await vscode.workspace.openTextDocument(definitionUri);
              linesSplit = otherDoc.getText().split(/\r?\n/);
            } catch {
              linesSplit = fullText.split(/\r?\n/);
            }
          }
        }
        const localRaw = localDef?.docstring?.trim();
        if (localDef) {
          const sig = extractDefinitionSignature(linesSplit, localDef.line, localDef.kind);
          const sigBlock = sig ? ["```python", sig, "```"].join("\n") : "";
          const preserveVariableCommentLines =
            localDef.kind === "variable" ||
            localDef.kind === "variable_local" ||
            localDef.kind === "define" ||
            localDef.kind === "default";
          const localRawForMarkdown =
            preserveVariableCommentLines && localRaw ? localRaw.replace(/\n/g, "  \n") : localRaw;
          const docPart =
            preferLocal && localRawForMarkdown
              ? formatDocstringToMarkdown(localRawForMarkdown, { resolveCrossRef, enclosingClass: docstringClassContext })
              : "";
          localMd = [sigBlock, docPart].filter(Boolean).join("\n\n");
        }

        const docUrl = resolveDocUrl(symbol);

        let onlineBody = "";
        if (fetchOnline && docUrl && (!localMd || showOnlineWithLocal)) {
          const cached = excerptCache.get(docUrl);
          if (cached !== undefined) {
            onlineBody = cached ?? "";
          } else {
            try {
              const excerpt = await loadDocExcerpt(docUrl);
              excerptCache.set(docUrl, excerpt);
              onlineBody = excerpt ?? "";
            } catch {
              excerptCache.set(docUrl, null);
              onlineBody = "";
            }
          }
        }

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        
        // Header
        if (localDef) {
          const t = escapeMarkdownLinkLabel(symbol);
          const href = makeOpenDefinitionCommandLink(definitionUri, localDef.line);
          md.appendMarkdown(`### [${t}](${href})\n\n`);
        } else {
          md.appendMarkdown(`### ${symbol}\n\n`);
        }
        
        // Signature code block + formatted docstring
        if (localDef) {
          const sig = extractDefinitionSignature(linesSplit, localDef.line, localDef.kind);
          if (sig) {
            md.appendMarkdown(`\`\`\`python\n${sig}\n\`\`\`\n\n`);
          }
          
          const rawDoc = localDef.docstring?.trim();
          if (rawDoc && preferLocal) {
            // Dedent: remove common indentation (first line is already trimmed by extraction)
            const lines = rawDoc.split('\n');
            const linesToCheck = lines.slice(1).filter(l => l.trim().length > 0);
            const minIndent = linesToCheck.length > 0 
              ? linesToCheck.reduce((min, line) => {
                  const match = line.match(/^(\s*)/);
                  const indent = match ? match[1]!.length : 0;
                  return Math.min(min, indent);
                }, Infinity)
              : 0;
            const dedented = lines.map((l, i) => i === 0 ? l : l.slice(minIndent)).join('\n');
            
            const formatted = formatDocstringToMarkdown(dedented, { resolveCrossRef, enclosingClass: docstringClassContext });
            md.appendMarkdown(formatted);
          }
          
          if (indexedDef?.kind === "class") {
            appendClassHierarchyMarkdown(md, indexedDef, mergedIndexed);
          }
          if (indexedDef?.kind === "label") {
            appendLabelHierarchyMarkdown(md, indexedDef, mergedIndexed);
          }
          
          if (docUrl && showOnlineWithLocal) {
            md.appendMarkdown("\n\n---\n\n");
          }
        }

        if (docUrl && (!(localDef?.docstring) || showOnlineWithLocal)) {
          if (onlineBody) {
            md.appendMarkdown(`${onlineBody}\n\n`);
          } else if (fetchOnline && !localDef?.docstring) {
            md.appendMarkdown(`*Could not load summary from the documentation page.*\n\n`);
          }
          md.appendMarkdown(`[Ren'Py documentation](${docUrl})`);
        } else if (!localDef?.docstring && !docUrl) {
          md.appendMarkdown(
            `No local docstring and no Ren'Py index entry. [Search documentation](${searchFallbackUrl(
              symbol
            )})`
          );
        }

        return new vscode.Hover(md, range);
      },
    }
  );

  context.subscriptions.push(
    hover,
    registerRenpyDocCompletions(projectIndex),
    registerRenpySignatureHelp(projectIndex)
  );
}

export function deactivate(): void {}
