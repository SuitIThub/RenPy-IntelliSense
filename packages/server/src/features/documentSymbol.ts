/**
 * Document Symbol provider for the Ren'Py Language Server
 * Provides outline view and breadcrumb support
 */

import { DocumentSymbol, SymbolKind, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { IndexedSymbol, DefKind } from "@renpy-intellisense/shared";
import { ProjectIndex } from "../analysis/index";
import { scanQualifiedDefinitions } from "../analysis/scanner";

function defKindToSymbolKind(kind: DefKind): SymbolKind {
  switch (kind) {
    case "def":
      return SymbolKind.Function;
    case "class":
      return SymbolKind.Class;
    case "label":
      return SymbolKind.Event;
    case "screen":
      return SymbolKind.Interface;
    case "transform":
      return SymbolKind.Constructor;
    case "image":
      return SymbolKind.File;
    case "define":
      return SymbolKind.Constant;
    case "default":
      return SymbolKind.Variable;
    case "variable":
    case "variable_local":
      return SymbolKind.Variable;
    default:
      return SymbolKind.Variable;
  }
}

function getSymbolDetail(kind: DefKind): string {
  switch (kind) {
    case "def":
      return "function";
    case "class":
      return "class";
    case "label":
      return "label";
    case "screen":
      return "screen";
    case "transform":
      return "transform";
    case "image":
      return "image";
    case "define":
      return "define";
    case "default":
      return "default";
    case "variable":
      return "variable";
    case "variable_local":
      return "local variable";
    default:
      return "";
  }
}

function findSymbolEndLine(lines: string[], startLine: number, kind: DefKind): number {
  // For block-level definitions (class, def, screen, transform, label),
  // find the end based on indentation
  if (kind === "variable" || kind === "variable_local" || kind === "define" || kind === "default" || kind === "image") {
    // Single-line definitions
    return startLine;
  }

  const startIndent = getIndent(lines[startLine] || "");
  
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i] || "";
    const trimmed = line.trim();
    
    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const currentIndent = getIndent(line);
    
    // If we hit a line with same or less indentation, the block has ended
    if (currentIndent <= startIndent && trimmed.length > 0) {
      return i - 1;
    }
  }
  
  return lines.length - 1;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1]!.length : 0;
}

function buildSymbolHierarchy(symbols: IndexedSymbol[], lines: string[]): DocumentSymbol[] {
  const result: DocumentSymbol[] = [];
  const classStack: { symbol: DocumentSymbol; endLine: number; indent: number }[] = [];

  // Sort by line number
  const sortedSymbols = [...symbols].sort((a, b) => a.line - b.line);

  for (const sym of sortedSymbols) {
    const endLine = findSymbolEndLine(lines, sym.line, sym.kind);
    const symbolRange = Range.create(sym.line, 0, endLine, (lines[endLine] || "").length);
    const selectionRange = Range.create(sym.line, 0, sym.line, (lines[sym.line] || "").length);

    const docSymbol: DocumentSymbol = {
      name: sym.simpleName,
      detail: getSymbolDetail(sym.kind),
      kind: defKindToSymbolKind(sym.kind),
      range: symbolRange,
      selectionRange: selectionRange,
      children: [],
    };

    // Pop any classes that have ended
    while (classStack.length > 0) {
      const top = classStack[classStack.length - 1]!;
      if (sym.line > top.endLine) {
        classStack.pop();
      } else {
        break;
      }
    }

    // Check if this symbol is a method inside a class
    if (sym.kind === "def" && sym.qualifiedName.includes(".")) {
      const parts = sym.qualifiedName.split(".");
      if (parts.length >= 2) {
        // Find the parent class in the stack
        const parentClassName = parts[parts.length - 2];
        const parent = classStack.find(c => c.symbol.name === parentClassName);
        if (parent) {
          parent.symbol.children!.push(docSymbol);
          continue;
        }
      }
    }

    // If this is a class, push it onto the stack
    if (sym.kind === "class") {
      classStack.push({
        symbol: docSymbol,
        endLine: endLine,
        indent: getIndent(lines[sym.line] || ""),
      });
    }

    result.push(docSymbol);
  }

  return result;
}

export function provideDocumentSymbols(
  document: TextDocument,
  projectIndex: ProjectIndex
): DocumentSymbol[] | null {
  const uri = document.uri;
  const fullText = document.getText();
  const lines = fullText.split(/\r?\n/);

  // Scan the document for symbols
  const symbols = scanQualifiedDefinitions(fullText, uri);

  if (symbols.length === 0) return null;

  return buildSymbolHierarchy(symbols, lines);
}
