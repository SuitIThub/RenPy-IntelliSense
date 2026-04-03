/**
 * Extract docstrings placed immediately after a definition line.
 * Supports standard Python """ / ''' blocks and Ren'Py script lines with leading #.
 */

function findClosingTriple(line: string, quote: '"""' | "'''"): number {
  let i = 0;
  while (i < line.length) {
    const idx = line.indexOf(quote, i);
    if (idx < 0) return -1;
    let bs = 0;
    for (let j = idx - 1; j >= 0 && line[j] === "\\"; j--) bs++;
    if (bs % 2 === 0) return idx;
    i = idx + quote.length;
  }
  return -1;
}

/** Strip one leading `#` from a script line (Ren'Py non-python blocks). */
function stripHashPrefix(line: string): { content: string; hadHash: boolean } {
  const m = line.match(/^(\s*)#\s?(.*)$/);
  if (m) return { content: (m[1] ?? "") + (m[2] ?? ""), hadHash: true };
  return { content: line, hadHash: false };
}

function normalizeDocstring(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

/** Remove BOM / zero-width chars that break """ detection at line start. */
export function stripInvisibleLeading(s: string): string {
  return s.replace(/^\uFEFF/, "").replace(/^[\u200B-\u200D\uFEFF]+/, "");
}

/**
 * Advance past blank lines and trivial placeholder statements so the docstring
 * can appear after `pass` / `...` (invalid but seen in the wild) or extra blanks.
 */
function skipToDocstringCandidate(lines: string[], startIdx: number): number {
  let i = startIdx;
  while (i < lines.length) {
    const raw = stripInvisibleLeading(lines[i]!);
    if (/^\s*$/.test(raw)) {
      i++;
      continue;
    }
    const t = raw.trim();
    if (t === "pass" || t === "..." || t === "breakpoint()") {
      i++;
      continue;
    }
    break;
  }
  return i;
}

export function extractDocstringAfterDefinition(lines: string[], defLineIdx: number): string | null {
  let i = skipToDocstringCandidate(lines, defLineIdx + 1);
  if (i >= lines.length) return null;

  const triple = tryExtractTripleQuoted(lines, i);
  if (triple !== null) return triple;

  return tryExtractHashOnlyBlock(lines, i);
}

function tryExtractTripleQuoted(lines: string[], startIdx: number): string | null {
  const rawFirst = stripInvisibleLeading(lines[startIdx]!);
  const st0 = stripHashPrefix(rawFirst);
  const openedWithHash = st0.hadHash;
  let lineForOpen = st0.content;

  const openRe = /^(\s*)((?:r|u|ur|R|U)?)("""|''')/;
  let om = lineForOpen.match(openRe);
  if (!om) {
    lineForOpen = lineForOpen.replace(/[\u201C\u201D\u201E\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u2032\u2035]/g, "'");
    om = lineForOpen.match(openRe);
  }
  if (!om) return null;

  const quote = om[3] as '"""' | "'''";
  const afterOpen = lineForOpen.slice(om[0].length);

  const closeSame = findClosingTriple(afterOpen, quote);
  if (closeSame >= 0) {
    return normalizeDocstring(afterOpen.slice(0, closeSame).trim());
  }

  const buf: string[] = [];
  if (afterOpen.trim().length > 0) buf.push(afterOpen);

  for (let j = startIdx + 1; j < lines.length; j++) {
    const raw = stripInvisibleLeading(lines[j]!);
    const st = stripHashPrefix(raw);
    const lineText = openedWithHash ? (st.hadHash ? st.content : raw) : raw;

    const closeIdx = findClosingTriple(lineText, quote);
    if (closeIdx >= 0) {
      buf.push(lineText.slice(0, closeIdx));
      return normalizeDocstring(buf.join("\n"));
    }
    buf.push(lineText);
  }

  return null;
}

/**
 * Consecutive # comment lines (no triple quotes) as documentation.
 */
function tryExtractHashOnlyBlock(lines: string[], startIdx: number): string | null {
  const first = stripInvisibleLeading(lines[startIdx]!);
  const st = stripHashPrefix(first);
  if (!st.hadHash) return null;
  if (/^\s*(r|u|R|U)?("""|''')/.test(st.content)) return null;

  const buf: string[] = [];
  for (let lineIdx = startIdx; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx]!;
    const s = stripHashPrefix(raw);
    if (!s.hadHash) {
      if (/^\s*$/.test(raw)) break;
      break;
    }
    buf.push(s.content.trimEnd());
  }

  if (buf.length === 0) return null;
  const joined = buf.join("\n").trim();
  if (joined.length < 1) return null;
  return normalizeDocstring(joined);
}

export function lineLooksLikeDocstringStart(line: string): boolean {
  const st = stripHashPrefix(line);
  if (/^\s*(r|u|R|U)?("""|''')/.test(st.content)) return true;
  if (st.hadHash && st.content.trim().length > 0) return true;
  return false;
}
