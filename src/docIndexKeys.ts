import * as fs from "fs";
import * as path from "path";

let keys: string[] | null = null;

export function getIndexKeys(): string[] {
  if (keys) return keys;
  try {
    const p = path.join(__dirname, "..", "data", "doc-index.json");
    const raw = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(raw) as Record<string, string>;
    keys = Object.keys(obj);
    return keys;
  } catch {
    keys = [];
    return keys;
  }
}
