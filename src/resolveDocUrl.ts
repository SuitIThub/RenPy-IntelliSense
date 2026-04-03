import * as fs from "fs";
import * as path from "path";
import { EXTRA_DOC_LINKS } from "./extraLinks";
import { RENPY_DOC_BASE } from "./constants";

type IndexMap = Record<string, string>;

let cachedIndex: IndexMap | null = null;

function loadBundledIndex(): IndexMap {
  if (cachedIndex) return cachedIndex;
  try {
    const p = path.join(__dirname, "..", "data", "doc-index.json");
    const raw = fs.readFileSync(p, "utf8");
    cachedIndex = JSON.parse(raw) as IndexMap;
    return cachedIndex;
  } catch {
    cachedIndex = {};
    return cachedIndex;
  }
}

/** Try variants: full name, renpy.*, store stripped, case variants */
export function resolveDocUrl(symbol: string): string | null {
  const s = symbol.trim();
  if (!s) return null;

  const extra = EXTRA_DOC_LINKS[s];
  if (extra) return extra;

  const idx = loadBundledIndex();

  if (idx[s]) return idx[s];

  const lower = s.toLowerCase();
  if (EXTRA_DOC_LINKS[lower]) return EXTRA_DOC_LINKS[lower];

  if (idx[lower]) return idx[lower];

  if (s.startsWith("store.")) {
    const rest = s.slice(6);
    return idx[rest] ?? idx[lower.slice(6)] ?? null;
  }

  if (!s.startsWith("renpy.")) {
    const rp = `renpy.${s}`;
    if (idx[rp]) return idx[rp];
    if (idx[`renpy.${lower}`]) return idx[`renpy.${lower}`];
  }

  return null;
}

export function searchFallbackUrl(query: string): string {
  return `${RENPY_DOC_BASE}search.html?q=${encodeURIComponent(query)}`;
}
