/**
 * Shared constants for the Ren'Py Language Server
 */

export const RENPY_DOC_BASE = "https://www.renpy.org/doc/html/";

/** File extensions for Ren'Py files */
export const RENPY_EXTENSIONS = [".rpy", ".rpym"];

/** Glob pattern to exclude from indexing */
export const EXCLUDE_PATTERN = "**/{node_modules,.git,.venv,venv}/**";
