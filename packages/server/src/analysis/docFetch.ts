/**
 * Fetch documentation excerpts from the Ren'Py online documentation
 */

import * as https from "https";
import * as http from "http";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeBasicEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Strip tags; collapse whitespace */
export function stripHtml(html: string): string {
  const noTags = html.replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(noTags).replace(/\s+/g, " ").trim();
}

/**
 * Pull a short description from Ren'Py Sphinx HTML for a URL with #fragment.
 */
export function extractExcerptFromPage(html: string, fragment: string): string | null {
  const esc = escapeRegExp(fragment);
  if (html.search(new RegExp(`id="${esc}"`, "i")) < 0) return null;

  const afterId = new RegExp(
    `id="${esc}"[\\s\\S]*?</dt>\\s*<dd[^>]*>\\s*<p>([\\s\\S]*?)</p>`,
    "i"
  );
  const m1 = html.match(afterId);
  if (m1) {
    const t = stripHtml(m1[1]);
    if (t.length > 20) return t.slice(0, 1500);
  }

  const sectionP = new RegExp(`id="${esc}"[^>]*>[\\s\\S]*?<p>([\\s\\S]*?)</p>`, "i");
  const m2 = html.match(sectionP);
  if (m2) {
    const t = stripHtml(m2[1]);
    if (t.length > 20) return t.slice(0, 1500);
  }

  const anyDd = new RegExp(`id="${esc}"[\\s\\S]{0,8000}?<dd[^>]*>([\\s\\S]*?)</dd>`, "i");
  const m3 = html.match(anyDd);
  if (m3) {
    const inner = m3[1];
    const firstP = inner.match(/<p>([\s\S]*?)<\/p>/i);
    if (firstP) {
      const t = stripHtml(firstP[1]);
      if (t.length > 15) return t.slice(0, 1500);
    }
    const t = stripHtml(inner);
    if (t.length > 20) return t.slice(0, 1500);
  }

  return null;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(new URL(res.headers.location, url).href).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

export async function loadDocExcerpt(docUrl: string): Promise<string | null> {
  const u = new URL(docUrl);
  const fragment = u.hash ? decodeURIComponent(u.hash.slice(1)) : "";
  u.hash = "";
  const pageUrl = u.href;
  const html = await fetchText(pageUrl);
  if (!fragment) {
    const body = html.match(/<div[^>]+class="[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (body) {
      const firstP = body[1].match(/<p>([\s\S]*?)<\/p>/i);
      if (firstP) return stripHtml(firstP[1]).slice(0, 1200);
    }
    return null;
  }
  return extractExcerptFromPage(html, fragment);
}

/** Simple LRU cache for doc excerpts */
export function makeLru<K, V>(maxSize: number): {
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

// Global cache for doc excerpts
export const excerptCache = makeLru<string, string | null>(400);
