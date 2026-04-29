/**
 * Find All References provider for the Ren'Py Language Server
 */

import { Location, Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { IndexedSymbol } from "@renpy-intellisense/shared";
import { ProjectIndex } from "../analysis/index";
import { scanQualifiedDefinitions, indexedSymbolsToLocalDefinitions, definitionForSymbolAtLine } from "../analysis/scanner";
import { collectReceiverInferenceContext } from "../analysis/inference";
import { resolveIndexedSymbolForHover } from "../analysis/hoverResolve";

/** One identifier segment (no `.`) */
const IDENT = /[\w]/;

function wordRangeAtPosition(
  lineText: string,
  character: number
): { start: number; end: number } | null {
  let start = character;
  let end = character;

  if (start >= lineText.length || !IDENT.test(lineText[start]!)) {
    if (start > 0 && IDENT.test(lineText[start - 1]!)) start -= 1;
    else return null;
  }

  while (start > 0 && IDENT.test(lineText[start - 1]!)) start--;
  while (end < lineText.length && IDENT.test(lineText[end]!)) end++;

  if (start >= end) return null;
  const word = lineText.slice(start, end);
  if (!/[\w]/.test(word)) return null;

  return { start, end };
}

/**
 * Find all occurrences of a symbol name in a text
 */
function findSymbolOccurrences(text: string, symbol: string, uri: string): Location[] {
  const locations: Location[] = [];
  const lines = text.split(/\r?\n/);
  
  // Simple word boundary regex for the symbol
  const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g');
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    
    while ((match = regex.exec(line)) !== null) {
      locations.push(
        Location.create(
          uri,
          Range.create(lineNum, match.index, lineNum, match.index + symbol.length)
        )
      );
    }
  }
  
  return locations;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function provideReferences(
  document: TextDocument,
  position: Position,
  projectIndex: ProjectIndex,
  includeDeclaration: boolean
): Location[] | null {
  const uri = document.uri;
  const fullText = document.getText();
  const lines = fullText.split(/\r?\n/);
  const lineText = lines[position.line] || "";

  const range = wordRangeAtPosition(lineText, position.character);
  if (!range) return null;

  const symbol = lineText.slice(range.start, range.end);

  // Scan the current document for symbols
  const liveIndexed = scanQualifiedDefinitions(fullText, uri);
  const mergedIndexed = [
    ...liveIndexed,
    ...projectIndex.symbolsExceptCurrentFile(uri),
  ];

  // Build inference context
  const inferenceCtx = collectReceiverInferenceContext(
    uri,
    fullText,
    projectIndex.assignmentHintsExceptCurrentFile(uri),
    projectIndex.symbolsExceptCurrentFile(uri)
  );

  // Try to resolve the symbol to find its canonical name
  const memberHit = resolveIndexedSymbolForHover(
    mergedIndexed,
    lineText,
    range.start,
    range.end,
    position.line,
    inferenceCtx
  );

  let targetSymbol: IndexedSymbol | undefined = memberHit;
  
  if (!targetSymbol) {
    const localDef = definitionForSymbolAtLine(
      indexedSymbolsToLocalDefinitions(liveIndexed),
      symbol,
      position.line
    );
    if (localDef) {
      targetSymbol = liveIndexed.find(s => s.line === localDef.line && s.simpleName === localDef.name);
    }
  }

  if (!targetSymbol) {
    const wsDef = projectIndex.resolveForDocument(symbol, uri);
    if (wsDef) {
      targetSymbol = wsDef;
    }
  }

  // If we found a definition, search for all references to that symbol
  const searchName = targetSymbol?.simpleName ?? symbol;
  const allLocations: Location[] = [];
  const seenLocations = new Set<string>();

  // Search in current document
  const currentRefs = findSymbolOccurrences(fullText, searchName, uri);
  for (const loc of currentRefs) {
    const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`;
    if (!seenLocations.has(key)) {
      seenLocations.add(key);
      allLocations.push(loc);
    }
  }

  // Search in all indexed files
  const allSymbols = projectIndex.getAllSymbols();
  const fileUris = new Set<string>();
  for (const s of allSymbols) {
    fileUris.add(s.uri);
  }

  // For each file, we'd ideally re-read and search
  // For simplicity, just include definition locations from the index
  for (const s of allSymbols) {
    if (s.simpleName === searchName || s.qualifiedName.endsWith(`.${searchName}`)) {
      const key = `${s.uri}:${s.line}:0`;
      if (!seenLocations.has(key)) {
        seenLocations.add(key);
        allLocations.push(
          Location.create(s.uri, Range.create(s.line, 0, s.line, searchName.length))
        );
      }
    }
  }

  // Filter out declaration if not included
  if (!includeDeclaration && targetSymbol) {
    return allLocations.filter(
      loc => !(loc.uri === targetSymbol!.uri && loc.range.start.line === targetSymbol!.line)
    );
  }

  return allLocations.length > 0 ? allLocations : null;
}
