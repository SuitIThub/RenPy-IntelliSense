/**
 * Downloads Ren'Py Sphinx index pages and builds src/data/doc-index.json
 * Run: npm run generate-index
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data", "doc-index.json");
const BASE = "https://www.renpy.org/doc/html/";

const INDEX_PAGES = [
  "py-function-class-index.html",
  "std-var-index.html",
  "std-style-property-index.html",
  "std-transform-property-index.html",
];

function absolutize(href) {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return new URL(href, "https://www.renpy.org").href;
  return new URL(href, BASE).href;
}

function extractLinks(html) {
  const map = Object.create(null);
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].replace(/&amp;/g, "&");
    const inner = m[2].replace(/<[^>]+>/g, "").trim();
    if (!inner || !href.includes("#")) continue;
    if (!/\.html#/i.test(href)) continue;
    href = absolutize(href);
    const key = inner;
    if (!map[key]) map[key] = href;
  }
  return map;
}

async function main() {
  const combined = Object.create(null);
  for (const page of INDEX_PAGES) {
    const url = new URL(page, BASE).href;
    process.stderr.write(`Fetching ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const html = await res.text();
    const part = extractLinks(html);
    for (const k of Object.keys(part)) {
      if (!(k in combined)) combined[k] = part[k];
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(combined, null, 0), "utf8");
  const n = Object.keys(combined).length;
  process.stderr.write(`Wrote ${n} entries to ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
