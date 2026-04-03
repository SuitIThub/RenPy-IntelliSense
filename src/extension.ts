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
import { definitionForSymbolAtLine } from "./localDefinitions";
import { ProjectIndex } from "./projectIndex";
import { indexedSymbolsToLocalDefinitions, scanQualifiedDefinitions } from "./qualifiedDefinitions";
import { resolveDocUrl, searchFallbackUrl } from "./resolveDocUrl";
import { registerRenpySignatureHelp } from "./signatureHelp";
import { isRenpyFile, wordRangeAtPosition } from "./symbolRange";

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
    )
  );

  refreshCacheSize();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("renpyDocHover.cacheSize")) refreshCacheSize();
    })
  );

  const hover = vscode.languages.registerHoverProvider(
    [{ language: "renpy" }, { language: "python" }],
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
        const indexed = scanQualifiedDefinitions(fullText, document.uri);
        const localDefs = indexedSymbolsToLocalDefinitions(indexed);
        const localDef = definitionForSymbolAtLine(localDefs, symbol, position.line);
        const resolveCrossRef = createMergedCrossRefResolver(projectIndex, document);

        let localMd = "";
        const linesSplit = fullText.split(/\r?\n/);
        const localRaw = localDef?.docstring?.trim();
        if (localDef) {
          const sig = extractDefinitionSignature(linesSplit, localDef.line);
          const sigBlock = sig ? ["```python", sig, "```"].join("\n") : "";
          const docPart =
            preferLocal && localRaw
              ? formatDocstringToMarkdown(localRaw, { resolveCrossRef })
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
        if (localDef) {
          const t = escapeMarkdownLinkLabel(symbol);
          const href = makeOpenDefinitionCommandLink(document.uri, localDef.line);
          md.appendMarkdown(`### [${t}](${href})\n\n`);
        } else {
          md.appendMarkdown(`### ${symbol}\n\n`);
        }

        if (localMd) {
          md.appendMarkdown(localMd);
          if (docUrl && showOnlineWithLocal) {
            md.appendMarkdown("\n\n---\n\n");
          } else if (!docUrl) {
            md.appendMarkdown("\n");
          }
        }

        if (docUrl && (!localMd || showOnlineWithLocal)) {
          if (onlineBody) {
            md.appendMarkdown(`${onlineBody}\n\n`);
          } else if (fetchOnline && !localMd) {
            md.appendMarkdown(`*Could not load summary from the documentation page.*\n\n`);
          }
          md.appendMarkdown(`[Ren'Py documentation](${docUrl})`);
        } else if (!localMd && !docUrl) {
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
