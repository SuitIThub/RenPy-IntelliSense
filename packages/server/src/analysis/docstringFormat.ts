/**
 * Format docstrings to Markdown for display in hovers and completions
 */

import { DefKind, CrossRefLocation } from "@renpy-intellisense/shared";

export interface FormatDocstringOptions {
  resolveCrossRef?: (name: string) => CrossRefLocation | undefined;
}

export interface ExtractedCrossRef {
  name: string;
  role: string;
  location?: CrossRefLocation;
}

/**
 * Extract all cross-references from a docstring without formatting.
 * Returns unique references found in Sphinx :role:`name` format.
 */
export function extractCrossReferences(
  raw: string,
  resolveCrossRef?: (name: string) => CrossRefLocation | undefined
): ExtractedCrossRef[] {
  const refs: ExtractedCrossRef[] = [];
  const seen = new Set<string>();
  
  // Match Sphinx :role:`name` patterns
  const sphinxPattern = /:([a-z]+):`([^`]+)`/gi;
  let match;
  
  while ((match = sphinxPattern.exec(raw)) !== null) {
    const role = match[1]!;
    const inner = match[2]!;
    const name = inner.includes("<") ? inner.split("<")[0]!.trim() : inner.trim();
    
    // Skip duplicates
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    
    const location = resolveCrossRef?.(name);
    refs.push({ name, role, location });
  }
  
  // Also match backtick references like `SomeClass` or `some_function`
  const backtickPattern = /`([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)`/g;
  while ((match = backtickPattern.exec(raw)) !== null) {
    const name = match[1]!;
    
    // Skip if already found via Sphinx role
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    
    const location = resolveCrossRef?.(name);
    // Only include if we can resolve it (otherwise it might just be code formatting)
    if (location) {
      refs.push({ name, role: "ref", location });
    }
  }
  
  return refs;
}

/** Escape text used inside `[...](url)` link labels (CommonMark). */
export function escapeMarkdownLinkLabel(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

/**
 * Format raw docstring text as Markdown for hovers.
 * Handles Google / NumPy / reST-style section titles, Epydoc tags, and Sphinx roles.
 */
export function formatDocstringToMarkdown(raw: string, options?: FormatDocstringOptions): string {
  let s = raw.replace(/\r\n/g, "\n");

  s = normalizeEpydocTags(s);
  s = normalizeFieldLabels(s);
  s = replaceSphinxRoles(s, options);
  s = replaceInlineDoubleBackticks(s);
  s = convertDoctestBlocks(s);

  return s.trim();
}

/** @param, @returns, @raise, @type (Epydoc / PyCharm style) */
function normalizeEpydocTags(s: string): string {
  return s
    .replace(/^(\s*)@param\s+(\w+)\s*[:-]?\s*(.*)$/gim, "$1- **`$2`** — $3")
    .replace(/^(\s*)@returns?\s*[:-]?\s*(.*)$/gim, "$1**Returns:** $2")
    .replace(/^(\s*)@yield\s*[:-]?\s*(.*)$/gim, "$1**Yields:** $2")
    .replace(/^(\s*)@raises?\s+(\w+)\s*[:-]?\s*(.*)$/gim, "$1- **`$2`** — $3")
    .replace(/^(\s*)@type\s+(\w+)\s*[:-]?\s*(.*)$/gim, "$1- *Type (`$2`):* $3");
}

function normalizeFieldLabels(s: string): string {
  return s
    .replace(/^(\s*)Args:\s*$/gim, "$1**Parameters:**\n")
    .replace(/^(\s*)Arguments:\s*$/gim, "$1**Parameters:**\n")
    .replace(/^(\s*)Parameters:\s*$/gim, "$1**Parameters:**\n")
    .replace(/^(\s*)Returns:\s*$/gim, "$1**Returns:**\n")
    .replace(/^(\s*)Yields:\s*$/gim, "$1**Yields:**\n")
    .replace(/^(\s*)Raises:\s*$/gim, "$1**Raises:**\n")
    .replace(/^(\s*)Notes?\s*:\s*$/gim, "$1**Note:**\n")
    .replace(/^(\s*)Warning:\s*$/gim, "$1**Warning:**\n")
    .replace(/^(\s*)Example:\s*$/gim, "$1**Example:**\n")
    .replace(/^(\s*)Examples:\s*$/gim, "$1**Examples:**\n")
    .replace(/^(\s*)Attributes:\s*$/gim, "$1**Attributes:**\n")
    .replace(/^(\s*)See Also:\s*$/gim, "$1**See also:**\n");
}

/** Sphinx :role:`text` — dots allowed (FragmentStorage.add_event) */
function replaceSphinxRoles(s: string, options?: FormatDocstringOptions): string {
  return s.replace(/:([a-z]+):`([^`]+)`/gi, (_full, role: string, inner: string) => {
    const name = inner.includes("<") ? inner.split("<")[0]!.trim() : inner.trim();
    const loc = options?.resolveCrossRef?.(name);
    const r = role.toLowerCase();
    const label =
      r === "class"
        ? "class"
        : r === "func" || r === "meth"
          ? "function"
          : r === "ref"
            ? "ref"
            : role;

    const code = `\`${name}\``;

    if (loc) {
      const lbl = escapeMarkdownLinkLabel(name);
      // In LSP, we return plain markdown links that the client can handle
      return `\`${lbl}\` _(${label})_`;
    }

    return `${code} _(${label})_`;
  });
}

function replaceInlineDoubleBackticks(s: string): string {
  return s.replace(/``([^`]+)``/g, "`$1`");
}

function convertDoctestBlocks(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let inDoctest = false;
  for (const line of lines) {
    if (/^>>> /.test(line) || /^\.\.\. /.test(line)) {
      if (!inDoctest) {
        out.push("```text");
        inDoctest = true;
      }
      out.push(line);
    } else {
      if (inDoctest && (line.trim() === "" || !/^[\s>]/.test(line))) {
        out.push("```");
        inDoctest = false;
      }
      out.push(line);
    }
  }
  if (inDoctest) out.push("```");
  return out.join("\n");
}
