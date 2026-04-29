/**
 * Completion provider for the Ren'Py Language Server
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  MarkupKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RenpyServerSettings, AtlKeyword, ScreenKeyword } from "@renpy-intellisense/shared";
import { ProjectIndex } from "../analysis/index";
import { scanQualifiedDefinitions } from "../analysis/scanner";
import { extractDefinitionSignature } from "../analysis/definitionSignature";
import { formatDocstringToMarkdown } from "../analysis/docstringFormat";
import { resolveDocUrl, EXTRA_DOC_LINKS, getIndexKeys } from "../data/docLinks";
import { ALL_ATL_KEYWORDS } from "../data/atlKeywords";
import { ALL_SCREEN_KEYWORDS, SCREEN_ACTIONS } from "../data/screenKeywords";

/**
 * Detect if cursor is inside a transform/ATL block.
 */
function isInAtlContext(lines: string[], lineNum: number): boolean {
  for (let i = lineNum; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    if (/^\s*transform\s+\w+/.test(line)) return true;
    if (/^\s*at\s+\w+/.test(line)) return true;
    if (/^\s*show\s+/.test(line) && i === lineNum) return false;
    if (/^\s*(screen|label|def|class)\s+/.test(line)) return false;
    if (i < lineNum && /^\S/.test(line)) return false;
  }
  return false;
}

/**
 * Detect if cursor is inside a screen block.
 */
function isInScreenContext(lines: string[], lineNum: number): boolean {
  for (let i = lineNum; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    if (/^\s*screen\s+\w+/.test(line)) return true;
    if (/^\s*(label|def|class|transform)\s+/.test(line) && !/^\s*screen/.test(line)) return false;
    if (i < lineNum && /^\S/.test(line) && !/^\s*screen/.test(line)) return false;
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

function atlKeywordToCompletionItem(kw: AtlKeyword): CompletionItem {
  const item: CompletionItem = {
    label: kw.name,
    kind: kw.kind === "warper" 
      ? CompletionItemKind.Function
      : kw.kind === "statement"
        ? CompletionItemKind.Keyword
        : CompletionItemKind.Property,
    detail: kw.kind === "warper" ? "ATL warper" : kw.kind === "statement" ? "ATL statement" : "ATL property",
    documentation: {
      kind: MarkupKind.Markdown,
      value: kw.documentation,
    },
  };
  if (kw.snippet) {
    item.insertText = kw.snippet;
    item.insertTextFormat = InsertTextFormat.Snippet;
  }
  return item;
}

function screenKeywordToCompletionItem(kw: ScreenKeyword): CompletionItem {
  let kind: CompletionItemKind;
  let detail: string;
  switch (kw.kind) {
    case "displayable":
      kind = CompletionItemKind.Class;
      detail = "Screen displayable";
      break;
    case "property":
      kind = CompletionItemKind.Property;
      detail = "Screen property";
      break;
    case "action":
      kind = CompletionItemKind.Function;
      detail = "Screen action";
      break;
    case "statement":
      kind = CompletionItemKind.Keyword;
      detail = "Screen statement";
      break;
    default:
      kind = CompletionItemKind.Text;
      detail = "Screen";
  }
  const item: CompletionItem = {
    label: kw.name,
    kind,
    detail,
    documentation: {
      kind: MarkupKind.Markdown,
      value: kw.documentation,
    },
  };
  if (kw.snippet) {
    item.insertText = kw.snippet;
    item.insertTextFormat = InsertTextFormat.Snippet;
  }
  return item;
}

export function provideCompletion(
  document: TextDocument,
  position: Position,
  projectIndex: ProjectIndex,
  settings: RenpyServerSettings
): CompletionItem[] {
  const uri = document.uri;
  const fullText = document.getText();
  const lines = fullText.split(/\r?\n/);
  const lineText = lines[position.line] || "";
  const before = lineText.slice(0, position.character);
  const m = before.match(/[\w.$]+$/);
  const partial = m ? m[0] : "";

  const results: CompletionItem[] = [];
  const pl = partial.toLowerCase();

  // Check for persistent. prefix - provide known persistent vars
  if (before.endsWith("persistent.") || partial.startsWith("persistent.")) {
    const persistentVars = extractPersistentVariables(fullText);
    
    for (const v of persistentVars) {
      const shortName = v.replace("persistent.", "");
      if (shortName.toLowerCase().startsWith(pl.replace("persistent.", ""))) {
        results.push({
          label: shortName,
          kind: CompletionItemKind.Variable,
          detail: "Persistent variable",
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Persistent variable \`${v}\``,
          },
        });
      }
    }
    return results;
  }

  if (partial.length < 1) return results;

  // Check context for ATL/Screen completions
  const inAtl = isInAtlContext(lines, position.line);
  const inScreen = isInScreenContext(lines, position.line);

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

  // Always provide screen actions when in action= context
  if (/\baction\s*$/.test(before) || /\baction\s+[\w.]*$/.test(before)) {
    for (const kw of SCREEN_ACTIONS) {
      if (kw.name.toLowerCase().startsWith(pl)) {
        results.push(screenKeywordToCompletionItem(kw));
      }
    }
  }

  const indexKeys = getIndexKeys();
  const extraKeys = Object.keys(EXTRA_DOC_LINKS);
  const matched = new Set<string>();

  const localSyms = [
    ...scanQualifiedDefinitions(fullText, uri),
    ...projectIndex.symbolsExceptCurrentFile(uri),
  ];

  // Create cross-ref resolver
  const resolveCrossRef = (name: string) => {
    const live = localSyms.find((s) => s.qualifiedName === name || s.simpleName === name);
    if (live) return { uri: uri, line: live.line, kind: live.kind };
    const g = projectIndex.resolveForDocument(name, uri);
    if (g) return { uri: g.uri, line: g.line, kind: g.kind };
    return undefined;
  };

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
    const url = resolveDocUrl(name);
    const local = localSyms.find((d) => d.qualifiedName === name || d.simpleName === name);
    
    const item: CompletionItem = {
      label: name,
      kind: local ? CompletionItemKind.Function : CompletionItemKind.Reference,
    };

    if (local) {
      const sig = extractDefinitionSignature(lines, local.line, local.kind);
      const parts: string[] = [];
      if (sig) parts.push(["```python", sig, "```"].join("\n"));
      const ds = local.docstring?.trim();
      if (ds) parts.push(formatDocstringToMarkdown(ds, { resolveCrossRef }));
      if (url) parts.push(`${parts.length ? "\n\n" : ""}[Ren'Py documentation](${url})`);
      
      item.documentation = {
        kind: MarkupKind.Markdown,
        value: parts.join("\n\n"),
      };
      item.detail = ds ? "Local docstring" : "Local definition";
    } else {
      item.detail = "Ren'Py documentation";
      if (url) {
        item.documentation = {
          kind: MarkupKind.Markdown,
          value: `[Open documentation](${url})`,
        };
      }
    }

    results.push(item);
  }

  return results;
}
