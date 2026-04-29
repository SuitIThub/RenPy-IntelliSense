/**
 * Hover provider for the Ren'Py Language Server
 */

import { Hover, MarkupKind, Position } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { IndexedSymbol, LocalDefinition, RenpyServerSettings } from "@renpy-intellisense/shared";
import { ProjectIndex } from "../analysis/index";
import { scanQualifiedDefinitions, indexedSymbolsToLocalDefinitions, indexedToLocalName, definitionForSymbolAtLine } from "../analysis/scanner";
import { collectReceiverInferenceContext } from "../analysis/inference";
import { resolveIndexedSymbolForHover } from "../analysis/hoverResolve";
import { extractDefinitionSignature } from "../analysis/definitionSignature";
import { formatDocstringToMarkdown, escapeMarkdownLinkLabel, extractCrossReferences, ExtractedCrossRef } from "../analysis/docstringFormat";
import { resolveDocUrl, searchFallbackUrl } from "../data/docLinks";
import { loadDocExcerpt, excerptCache } from "../analysis/docFetch";

/** One identifier segment (no `.`), so `foo.bar` yields `bar` when the cursor is on `bar`. */
const IDENT = /[\w]/;

function wordRangeAtPosition(
  text: string,
  lineText: string,
  line: number,
  character: number
): { start: number; end: number } | null {
  let start = character;
  let end = character;

  if (start >= lineText.length || !IDENT.test(lineText[start]!)) {
    if (start > 0 && IDENT.test(lineText[start - 1]!)) start -= 1;
    else return null;
  }

  while (start > 0 && IDENT.test(lineText[start - 1]!)) start--;
  while (end < lineText.length && IDENT.test(lineText[end]!)) end++;

  if (start >= end) return null;
  const word = lineText.slice(start, end);
  if (!/[\w]/.test(word)) return null;

  return { start, end };
}

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
  uri: string,
  line: number,
  kind: LocalDefinition["kind"]
): IndexedSymbol | undefined {
  return symbols.find((s) => s.uri === uri && s.line === line && s.kind === kind);
}

function findBestClassSymbol(symbols: IndexedSymbol[], className: string): IndexedSymbol | undefined {
  const hits = symbols.filter((s) => s.kind === "class" && s.simpleName === className);
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line);
  return hits[0];
}

function findBestLabelSymbol(symbols: IndexedSymbol[], qualifiedLabelName: string): IndexedSymbol | undefined {
  const hits = symbols.filter((s) => s.kind === "label" && s.qualifiedName === qualifiedLabelName);
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line);
  return hits[0];
}

function appendClassHierarchyMarkdown(classSym: IndexedSymbol, symbols: IndexedSymbol[]): string {
  const seen = new Set<string>();
  const chain: IndexedSymbol[] = [];
  let cur: IndexedSymbol | undefined = classSym;

  while (cur) {
    const key = `${cur.uri}:${cur.line}:${cur.qualifiedName}`;
    if (seen.has(key)) break;
    seen.add(key);
    chain.push(cur);
    if (!cur.baseTypeHint) break;
    cur = findBestClassSymbol(symbols, cur.baseTypeHint);
  }

  if (chain.length <= 1) return "";

  const parts = chain.map((s) => `\`${escapeMarkdownLinkLabel(s.simpleName)}\``);
  return `\n\n**Class hierarchy:** ${parts.join(" -> ")}\n`;
}

function appendLabelHierarchyMarkdown(labelSym: IndexedSymbol, symbols: IndexedSymbol[]): string {
  const seen = new Set<string>();
  const chain: IndexedSymbol[] = [];
  let cur: IndexedSymbol | undefined = labelSym;

  while (cur) {
    const key = `${cur.uri}:${cur.line}:${cur.qualifiedName}`;
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

  if (chain.length <= 1) return "";

  const parts = chain.map((s) => `\`${escapeMarkdownLinkLabel(s.qualifiedName)}\``);
  return `\n\n**Label hierarchy:** ${parts.join(" -> ")}\n`;
}

/**
 * Check if a symbol kind is a "variable" type that other extensions don't handle well
 * (no docstring support in Ren'Py Language extension for these)
 */
function isVariableKind(kind: LocalDefinition["kind"]): boolean {
  return (
    kind === "variable" ||
    kind === "variable_local" ||
    kind === "define" ||
    kind === "default"
  );
}

/**
 * Check if a symbol is a built-in Ren'Py symbol (in doc-index.json)
 */
function isBuiltinSymbol(docUrl: string | null): boolean {
  return docUrl !== null;
}

export async function provideHover(
  document: TextDocument,
  position: Position,
  projectIndex: ProjectIndex,
  settings: RenpyServerSettings
): Promise<Hover | null> {
  const uri = document.uri;
  const fullText = document.getText();
  const lines = fullText.split(/\r?\n/);
  const lineText = lines[position.line] || "";

  const range = wordRangeAtPosition(fullText, lineText, position.line, position.character);
  if (!range) return null;

  const symbol = lineText.slice(range.start, range.end);

  const liveIndexed = scanQualifiedDefinitions(fullText, uri);
  const mergedIndexed = [
    ...liveIndexed,
    ...projectIndex.symbolsExceptCurrentFile(uri),
  ];
  const inferenceCtx = collectReceiverInferenceContext(
    uri,
    fullText,
    projectIndex.assignmentHintsExceptCurrentFile(uri),
    projectIndex.symbolsExceptCurrentFile(uri)
  );

  const memberHit = resolveIndexedSymbolForHover(
    mergedIndexed,
    lineText,
    range.start,
    range.end,
    position.line,
    inferenceCtx
  );

  let definitionUri = uri;
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
    const ws = projectIndex.resolveForDocument(symbol, uri);
    if (ws) {
      localDef = indexedSymbolToLocalDefinition(ws);
      definitionUri = ws.uri;
      indexedDef = ws;
    }
  }

  // Create cross-ref resolver for docstrings
  const resolveCrossRef = (name: string) => {
    const live = liveIndexed.find((s) => s.qualifiedName === name || s.simpleName === name);
    if (live) return { uri: uri, line: live.line, kind: live.kind };
    const g = projectIndex.resolveForDocument(name, uri);
    if (g) return { uri: g.uri, line: g.line, kind: g.kind };
    return undefined;
  };

  const docUrl = resolveDocUrl(symbol);
  
  // Complement mode logic:
  // - For built-in symbols: Only show online documentation (other extension handles basics)
  // - For user classes/functions/labels: Only show hierarchy info (other extension handles signature/docstring)
  // - For variables: Show full info (other extension doesn't support variable docstrings)
  const isBuiltin = isBuiltinSymbol(docUrl);
  const isVariable = localDef ? isVariableKind(localDef.kind) : false;
  
  // In complement mode, skip signature/docstring for non-variable user definitions
  const showSignatureAndDocstring = !settings.complementMode || isVariable;
  // In complement mode for built-ins, only show online docs link (no excerpt duplication)
  const showOnlineExcerpt = !settings.complementMode || !isBuiltin;

  let localMd = "";
  let linesSplit = lines;
  if (localDef && definitionUri !== uri) {
    // Would need to read the other file - for now use what we have in the index
    const fileSymbols = projectIndex.getSymbolsForFile(definitionUri);
    // This is simplified - in full implementation would read the file
  }

  const localRaw = localDef?.docstring?.trim();
  
  // Extract cross-references from docstring for "See also" section
  // We do this even in complement mode to preserve navigation links
  const crossRefs = localRaw ? extractCrossReferences(localRaw, resolveCrossRef) : [];
  
  if (localDef && showSignatureAndDocstring) {
    const sig = extractDefinitionSignature(linesSplit, localDef.line, localDef.kind);
    const sigBlock = sig ? ["```python", sig, "```"].join("\n") : "";
    const preserveVariableCommentLines = isVariableKind(localDef.kind);
    const localRawForMarkdown =
      preserveVariableCommentLines && localRaw ? localRaw.replace(/\n/g, "  \n") : localRaw;
    const docPart =
      settings.preferLocalDocstring && localRawForMarkdown
        ? formatDocstringToMarkdown(localRawForMarkdown, { resolveCrossRef })
        : "";
    localMd = [sigBlock, docPart].filter(Boolean).join("\n\n");
  }

  let onlineBody = "";
  if (settings.fetchOnline && docUrl && showOnlineExcerpt && (!localMd || settings.showOnlineDocsWithLocal)) {
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

  // Build the markdown content
  const mdParts: string[] = [];

  // In complement mode, use a more minimal header for non-variable user definitions
  const showFullHeader = !settings.complementMode || isVariable || isBuiltin;

  if (localDef && showFullHeader) {
    const kindLabel = hoverKindLabel(localDef);
    const relPath = definitionUri.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/");
    const locLabel = `${relPath}:${localDef.line + 1}`;
    mdParts.push(`### (${kindLabel}) ${symbol}\n\n<sub>${locLabel}</sub>\n\n`);
  } else if (!localDef) {
    mdParts.push(`### ${symbol}\n\n`);
  }

  if (localMd) {
    mdParts.push(localMd);
  }
  
  // Always show hierarchy info (this is unique to our extension)
  if (indexedDef?.kind === "class") {
    const hierarchy = appendClassHierarchyMarkdown(indexedDef, mergedIndexed);
    if (hierarchy) {
      if (!localMd && settings.complementMode) {
        // Add a minimal header for hierarchy-only display
        mdParts.push(`**${symbol}**\n`);
      }
      mdParts.push(hierarchy);
    }
  }
  if (indexedDef?.kind === "label") {
    const hierarchy = appendLabelHierarchyMarkdown(indexedDef, mergedIndexed);
    if (hierarchy) {
      if (!localMd && settings.complementMode) {
        // Add a minimal header for hierarchy-only display
        mdParts.push(`**${symbol}**\n`);
      }
      mdParts.push(hierarchy);
    }
  }
  
  // Show "See also" section with cross-references from docstring
  // This is always shown (both normal and complement mode) as it provides unique navigation
  if (crossRefs.length > 0) {
    // In complement mode without other content, add a minimal header first
    if (settings.complementMode && !localMd && mdParts.length === 0) {
      mdParts.push(`**${symbol}**\n\n`);
    }
    
    const refLinks = crossRefs
      .filter(ref => ref.location) // Only show resolvable references
      .map(ref => `\`${escapeMarkdownLinkLabel(ref.name)}\``)
      .slice(0, 10); // Limit to 10 references
    
    if (refLinks.length > 0) {
      mdParts.push(`\n\n**See also:** ${refLinks.join(", ")}\n`);
    }
  }
  
  if (localMd && docUrl && settings.showOnlineDocsWithLocal) {
    mdParts.push("\n\n---\n\n");
  } else if (localMd && !docUrl) {
    mdParts.push("\n");
  }

  if (docUrl && (!localMd || settings.showOnlineDocsWithLocal)) {
    if (onlineBody && showOnlineExcerpt) {
      mdParts.push(`${onlineBody}\n\n`);
    } else if (settings.fetchOnline && !localMd && showOnlineExcerpt) {
      mdParts.push(`*Could not load summary from the documentation page.*\n\n`);
    }
    mdParts.push(`[Ren'Py documentation](${docUrl})`);
  } else if (!localMd && !docUrl && mdParts.length === 0) {
    // Only show "no info" message if we have nothing else to show
    mdParts.push(
      `No local docstring and no Ren'Py index entry. [Search documentation](${searchFallbackUrl(symbol)})`
    );
  }

  // In complement mode, if we have nothing useful to add, return null
  if (settings.complementMode && mdParts.length === 0) {
    return null;
  }
  
  // Also return null if we only have a header with no content
  const content = mdParts.join("");
  if (settings.complementMode && !content.trim()) {
    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: content,
    },
    range: {
      start: { line: position.line, character: range.start },
      end: { line: position.line, character: range.end },
    },
  };
}
