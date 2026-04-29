/**
 * Go to Definition provider for the Ren'Py Language Server
 */

import { Definition, Location, Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
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

export function provideDefinition(
  document: TextDocument,
  position: Position,
  projectIndex: ProjectIndex
): Definition | null {
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

  // Build inference context for member access resolution
  const inferenceCtx = collectReceiverInferenceContext(
    uri,
    fullText,
    projectIndex.assignmentHintsExceptCurrentFile(uri),
    projectIndex.symbolsExceptCurrentFile(uri)
  );

  // Try to resolve through member access (e.g., obj.method)
  const memberHit = resolveIndexedSymbolForHover(
    mergedIndexed,
    lineText,
    range.start,
    range.end,
    position.line,
    inferenceCtx
  );

  if (memberHit) {
    return Location.create(
      memberHit.uri,
      Range.create(memberHit.line, 0, memberHit.line, 0)
    );
  }

  // Try local definitions first
  const localDef = definitionForSymbolAtLine(
    indexedSymbolsToLocalDefinitions(liveIndexed),
    symbol,
    position.line
  );

  if (localDef) {
    return Location.create(
      uri,
      Range.create(localDef.line, 0, localDef.line, 0)
    );
  }

  // Try workspace-wide resolution
  const wsDef = projectIndex.resolveForDocument(symbol, uri);
  if (wsDef) {
    return Location.create(
      wsDef.uri,
      Range.create(wsDef.line, 0, wsDef.line, 0)
    );
  }

  return null;
}
