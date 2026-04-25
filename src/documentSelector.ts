import * as vscode from "vscode";

/** Only `renpy` (not `python`) so Python language services are not doubled on the same buffer. See README setup for `*.rpy` / `*.rpym`. */
export const RENPY_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "renpy", scheme: "file" },
  { language: "renpy", scheme: "untitled" },
];
