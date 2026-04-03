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

function loadUrlMap(): Record<string, string> {
  const p = path.join(__dirname, "..", "data", "doc-index.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function registerRenpyDocCompletions(projectIndex: ProjectIndex): vscode.Disposable {
  const urlMap = loadUrlMap();
  const extraKeys = Object.keys(EXTRA_DOC_LINKS);

  const provider = vscode.languages.registerCompletionItemProvider(
    [{ language: "renpy" }, { language: "python" }],
    {
      provideCompletionItems(document, position) {
        if (!isRenpyFile(document)) return undefined;

        const line = document.lineAt(position.line).text;
        const before = line.slice(0, position.character);
        const m = before.match(/[\w.$]+$/);
        const partial = m ? m[0] : "";
        if (partial.length < 1) return undefined;

        const pl = partial.toLowerCase();
        const indexKeys = getIndexKeys();
        const matched = new Set<string>();

        const docText = document.getText();
        const linesSplit = docText.split(/\r?\n/);
        const localSyms = scanQualifiedDefinitions(docText, document.uri);
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

        return uniq.map((name) => {
          const url = urlMap[name] ?? EXTRA_DOC_LINKS[name];
          const local = localSyms.find((d) => d.qualifiedName === name || d.simpleName === name);
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
          if (local) {
            item.kind = vscode.CompletionItemKind.Function;
            const sig = extractDefinitionSignature(linesSplit, local.line);
            const parts: string[] = [];
            if (sig) parts.push(["```python", sig, "```"].join("\n"));
            const ds = local.docstring?.trim();
            if (ds) parts.push(formatDocstringToMarkdown(ds, { resolveCrossRef }));
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
          return item;
        });
      },
    },
    ".",
    "$"
  );

  return provider;
}
