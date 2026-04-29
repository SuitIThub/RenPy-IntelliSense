/**
 * Shared type definitions for the Ren'Py Language Server
 */

/** Definition kinds supported by Ren'Py */
export type DefKind =
  | "def"
  | "class"
  | "label"
  | "define"
  | "default"
  | "screen"
  | "transform"
  | "image"
  | "variable"
  | "variable_local";

/** A local definition found within a single document */
export interface LocalDefinition {
  name: string;
  kind: DefKind;
  /** 0-based line index of the definition line */
  line: number;
  docstring: string | null;
}

/** A symbol indexed across the workspace with qualified names */
export interface IndexedSymbol {
  /** e.g. "FragmentStorage.add_event", "Outer.Inner" */
  qualifiedName: string;
  /** Short name for hover matching (method/class name, or label segment) */
  simpleName: string;
  kind: DefKind;
  line: number;
  docstring: string | null;
  /** URI string of the document containing this symbol */
  uri: string;
  /** First token after `->` on the same line as `def` (receiver inference). */
  returnTypeHint?: string;
  /** First base class token in `class X(Base):` (receiver inference / inheritance). */
  baseTypeHint?: string;
  /** Parent label for dotted labels, e.g. `a.b` -> `a`. */
  parentLabelHint?: string;
}

/** Ren'Py / Python assignment line used to infer a variable's runtime type. */
export interface AssignmentRhsHint {
  uri: string;
  line: number;
  lhs: string;
  rhsExpr: string;
  /** `$ foo = …` — only applies in this file before the use line. */
  isLocal: boolean;
}

/** Context for receiver/type inference */
export interface ReceiverInferenceContext {
  hints: AssignmentRhsHint[];
  defs: IndexedSymbol[];
  currentUri: string;
}

/** Cross-reference location for navigation */
export interface CrossRefLocation {
  uri: string;
  line: number;
  kind?: DefKind;
}

/** ATL keyword definition */
export interface AtlKeyword {
  name: string;
  snippet?: string;
  documentation: string;
  kind: "property" | "statement" | "warper";
}

/** Screen language keyword definition */
export interface ScreenKeyword {
  name: string;
  snippet?: string;
  documentation: string;
  kind: "displayable" | "property" | "action" | "statement";
}

/** Configuration options for the language server */
export interface RenpyServerSettings {
  fetchOnline: boolean;
  cacheSize: number;
  preferLocalDocstring: boolean;
  showOnlineDocsWithLocal: boolean;
  /**
   * Complement mode: When enabled, only show information that other extensions
   * (like Ren'Py Language) don't provide:
   * - For built-in Ren'Py symbols: Only show online documentation links
   * - For user classes/functions/labels: Only show hierarchy info and cross-references
   * - For variables (define, default, etc.): Show full docstrings (other extensions don't support this)
   */
  complementMode: boolean;
  /**
   * When complement mode is enabled, also disable the Go to Definition provider
   * to avoid duplicate definition results with other extensions.
   */
  complementModeDisableDefinition: boolean;
}

/** Default configuration values */
export const DEFAULT_SETTINGS: RenpyServerSettings = {
  fetchOnline: true,
  cacheSize: 400,
  preferLocalDocstring: true,
  showOnlineDocsWithLocal: true,
  complementMode: false,
  complementModeDisableDefinition: true,
};
