import type { Uri } from "vscode";
import type { DefKind } from "./localDefinitions";

/** Must match `package.json` — used in trusted Markdown links (hovers / completions). */
export const OPEN_DEFINITION_COMMAND = "renpyDocHover.openDefinition";

/** Open the file at a 1-based line for command handlers (same as VS Code uses elsewhere). */
export function makeOpenDefinitionCommandLink(uri: Uri, line0: number): string {
  const args = [uri.toString(true), line0];
  return `command:${OPEN_DEFINITION_COMMAND}?${encodeURIComponent(JSON.stringify(args))}`;
}

/** Create a markdown link with tooltip showing the file location. */
export function makeDefinitionLink(uri: Uri, line0: number, label: string): string {
  const cmd = makeOpenDefinitionCommandLink(uri, line0);
  const escapedLabel = escapeMarkdownLinkLabel(label);
  // Extract just the filename from the path
  const filename = uri.path.split('/').pop() || uri.fsPath;
  const tooltip = `${filename}:${line0 + 1}`;
  // Escape quotes in tooltip
  const escapedTooltip = tooltip.replace(/"/g, '\\"');
  return `[${escapedLabel}](${cmd} "${escapedTooltip}")`;
}

export interface FormatDocstringOptions {
  /**
   * Resolve `:role:\`name\`` to a document location. Supports qualified names
   * (e.g. FragmentStorage.add_event) via the project index.
   */
  resolveCrossRef?: (name: string) => { uri: Uri; line: number; kind?: DefKind } | undefined;
  /**
   * Enclosing class context for resolving unqualified method/attribute references.
   * When set, `:func:\`method\`` will first try to resolve as `enclosingClass.method`.
   */
  enclosingClass?: string | null;
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

/**
 * Extract the base function/method name and the surrounding signature parts.
 * The inner text may contain: `name`, `name()`, `name(args)`, `name() -> Type`, 
 * `name(args) -> Type`, `display <actual>`, or nested roles.
 * 
 * Returns: { name: the resolvable name, prefix: text before name, suffix: text after name }
 */
function extractNameAndParts(inner: string): { name: string; prefix: string; suffix: string } {
  let text = inner.trim();
  let prefix = "";
  let suffix = "";

  // Handle display text with `<actual>` syntax: `:func:`display text <actual_name>``
  if (text.includes("<") && text.endsWith(">")) {
    const ltIdx = text.lastIndexOf("<");
    // In this case, use the actual name but display the custom text
    text = text.slice(ltIdx + 1, -1).trim();
    // For <actual> syntax, the whole display text becomes the "name" to show
    return { name: text, prefix: "", suffix: "" };
  }

  // Find where the name ends (at parenthesis, arrow, or end of string)
  const parenIdx = text.indexOf("(");
  const arrowIdx = text.indexOf("->");
  
  let nameEnd = text.length;
  if (parenIdx >= 0) nameEnd = Math.min(nameEnd, parenIdx);
  if (arrowIdx >= 0) nameEnd = Math.min(nameEnd, arrowIdx);
  
  const name = text.slice(0, nameEnd).trim();
  suffix = text.slice(nameEnd);

  return { name, prefix, suffix };
}

/**
 * Process a single Sphinx role, resolving cross-references.
 * Only the name part is linked, the rest (params, return type) is plain text.
 * @param isNested - true if this role is embedded inside another role's content
 */
function processSingleRole(
  role: string,
  inner: string,
  options?: FormatDocstringOptions,
  isNested: boolean = false
): string {
  const r = role.toLowerCase();

  // Determine the label based on role type
  const label =
    r === "class"
      ? "class"
      : r === "func" || r === "meth"
        ? "function"
        : r === "attr"
          ? "attribute"
          : r === "ref"
            ? "ref"
            : role;

  // Extract the name and surrounding parts (params, return type)
  const { name, prefix, suffix } = extractNameAndParts(inner);

  // Try to resolve - FIRST with class prefix if available (prioritize class members)
  let loc = undefined;
  if (options?.enclosingClass && !name.includes(".")) {
    const qualified = `${options.enclosingClass}.${name}`;
    loc = options.resolveCrossRef?.(qualified);
  }
  // Then try without class prefix
  if (!loc) {
    loc = options?.resolveCrossRef?.(name);
  }

  // Build the output: only the name is linked, suffix (params, return type) is plain text
  if (loc) {
    const linkedName = makeDefinitionLink(loc.uri, loc.line, name);
    
    if (isNested) {
      // Nested roles don't get the label prefix
      return `${prefix}${linkedName}${suffix}`;
    }
    return `_(${label})_ ${prefix}${linkedName}${suffix}`;
  }

  // Unresolved - show name as code, suffix as plain text
  if (isNested) {
    // For nested unresolved, use temporary markers for the name part
    return `${prefix}\u00AB${name}\u00BB${suffix}`;
  }
  return `_(${label})_ ${prefix}\`${name}\`${suffix}`;
}

interface RoleMatch {
  startIndex: number;
  endIndex: number;
  role: string;
  content: string;
  full: string;
}

/**
 * Find all Sphinx role matches with proper nesting support.
 * Correctly identifies nested :role:`...` by tracking backtick depth.
 */
function findAllRoleMatches(s: string): RoleMatch[] {
  const matches: RoleMatch[] = [];
  const startPattern = /:([a-z]+):`/gi;
  let startMatch;
  
  while ((startMatch = startPattern.exec(s)) !== null) {
    const startIndex = startMatch.index;
    const role = startMatch[1]!;
    const contentStart = startIndex + startMatch[0].length;
    
    // Find the matching closing backtick by counting nested :role:` patterns
    let depth = 1;
    let i = contentStart;
    
    while (i < s.length && depth > 0) {
      if (s[i] === '`') {
        // Check if this backtick is preceded by :role: (opening a nested role)
        const textBefore = s.slice(0, i);
        if (/:([a-z]+):$/i.test(textBefore)) {
          // This backtick opens a nested role
          depth++;
        } else {
          // This backtick closes a role
          depth--;
        }
      }
      i++;
    }
    
    if (depth === 0) {
      const endIndex = i; // Position after the closing backtick
      const content = s.slice(contentStart, endIndex - 1);
      const full = s.slice(startIndex, endIndex);
      matches.push({ startIndex, endIndex, role, content, full });
    }
  }
  
  return matches;
}

/**
 * Check if content contains the START of a role pattern (:role:`)
 */
function hasRoleStart(content: string): boolean {
  return /:([a-z]+):`/i.test(content);
}

/** 
 * Sphinx :role:`text` — handles nested roles by processing innermost first.
 * E.g., `:func:`add_event(event: :class:`Event`)``
 */
function replaceSphinxRoles(s: string, options?: FormatDocstringOptions): string {
  let result = s;
  let iterations = 0;
  const maxIterations = 50; // Prevent infinite loops
  
  // Process one innermost role at a time
  while (iterations < maxIterations) {
    iterations++;
    
    const matches = findAllRoleMatches(result);
    
    if (matches.length === 0) {
      break;
    }
    
    // Find an innermost match (one whose content has no :role:` patterns)
    const innermost = matches.find(m => !hasRoleStart(m.content));
    
    if (!innermost) {
      // All matches have nested roles - shouldn't happen if parsing is correct
      break;
    }
    
    // Check if this role is nested (there's an unclosed :role:` before it)
    const before = result.slice(0, innermost.startIndex);
    const isNested = /:([a-z]+):`[^`]*$/.test(before);
    
    const replacement = processSingleRole(innermost.role, innermost.content, options, isNested);
    const after = result.slice(innermost.endIndex);
    result = before + replacement + after;
  }
  
  // Convert temporary markers back to backticks for unresolved nested roles
  result = result.replace(/\u00AB([^\u00BB]+)\u00BB/g, "`$1`");
  
  return result;
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
