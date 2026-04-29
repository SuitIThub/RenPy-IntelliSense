/**
 * Documentation URL resolution for Ren'Py symbols
 */

import * as fs from "fs";
import * as path from "path";
import { RENPY_DOC_BASE } from "@renpy-intellisense/shared";

type IndexMap = Record<string, string>;

let cachedIndex: IndexMap | null = null;

function loadBundledIndex(): IndexMap {
  if (cachedIndex) return cachedIndex;
  try {
    // Try to load from the data directory relative to the server
    const p = path.join(__dirname, "..", "..", "..", "data", "doc-index.json");
    const raw = fs.readFileSync(p, "utf8");
    cachedIndex = JSON.parse(raw) as IndexMap;
    return cachedIndex;
  } catch {
    cachedIndex = {};
    return cachedIndex;
  }
}

/** Script keywords and topics not covered by the generated Sphinx indexes */
export const EXTRA_DOC_LINKS: Record<string, string> = {
  label: `${RENPY_DOC_BASE}label.html#label-statement`,
  jump: `${RENPY_DOC_BASE}label.html#jump-statement`,
  call: `${RENPY_DOC_BASE}label.html#call-statement`,
  return: `${RENPY_DOC_BASE}label.html#return-statement`,
  pass: `${RENPY_DOC_BASE}conditional.html#pass-statement`,
  menu: `${RENPY_DOC_BASE}menus.html#in-game-menus`,
  scene: `${RENPY_DOC_BASE}displaying_images.html#scene-statement`,
  show: `${RENPY_DOC_BASE}displaying_images.html#show-statement`,
  hide: `${RENPY_DOC_BASE}displaying_images.html#hide-statement`,
  with: `${RENPY_DOC_BASE}transitions.html#with-statement`,
  window: `${RENPY_DOC_BASE}dialogue.html#window`,
  play: `${RENPY_DOC_BASE}audio.html#play-statement`,
  queue: `${RENPY_DOC_BASE}audio.html#queue-statement`,
  stop: `${RENPY_DOC_BASE}audio.html#stop-statement`,
  python: `${RENPY_DOC_BASE}python.html`,
  init: `${RENPY_DOC_BASE}python.html#init-python-statement`,
  define: `${RENPY_DOC_BASE}python.html#define-statement`,
  default: `${RENPY_DOC_BASE}python.html#default-statement`,
  transform: `${RENPY_DOC_BASE}transforms.html`,
  image: `${RENPY_DOC_BASE}displaying_images.html#image-statement`,
  screen: `${RENPY_DOC_BASE}screens.html`,
  zorder: `${RENPY_DOC_BASE}displaying_images.html#zorder-statement`,
  on: `${RENPY_DOC_BASE}displaying_images.html#on-statement`,
  voice: `${RENPY_DOC_BASE}voice.html`,
  movie: `${RENPY_DOC_BASE}movie.html`,
  pause: `${RENPY_DOC_BASE}quickstart.html#pause-statement`,
  camera: `${RENPY_DOC_BASE}3dstage.html`,
  translate: `${RENPY_DOC_BASE}translation.html`,
  if: `${RENPY_DOC_BASE}conditional.html#if-statement`,
  elif: `${RENPY_DOC_BASE}conditional.html#if-statement`,
  else: `${RENPY_DOC_BASE}conditional.html#if-statement`,
  while: `${RENPY_DOC_BASE}conditional.html#while-statement`,
  $: `${RENPY_DOC_BASE}python.html#python-statement`,
};

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

export function getIndexKeys(): string[] {
  const idx = loadBundledIndex();
  return Object.keys(idx);
}
