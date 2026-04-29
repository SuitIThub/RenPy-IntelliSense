/**
 * Ren'Py IntelliSense - VS Code Client Extension
 * 
 * This is the VS Code client that starts and manages the Ren'Py Language Server.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext): void {
  // Path to the server module
  // In production (packaged): ./server/out/server.js
  // In development (monorepo): ../server/out/server.js
  const productionPath = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );
  const developmentPath = context.asAbsolutePath(
    path.join("..", "server", "out", "server.js")
  );
  
  const serverModule = fs.existsSync(productionPath) ? productionPath : developmentPath;

  // Debug options for the server
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // Server options - run the server as a Node module
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Client options - register for Ren'Py files
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "renpy" },
      { scheme: "untitled", language: "renpy" },
    ],
    synchronize: {
      // Synchronize configuration section
      configurationSection: "renpyDocHover",
      // Notify server about file changes to .rpy files
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{rpy,rpym}"),
    },
  };

  // Create the language client
  client = new LanguageClient(
    "renpyLanguageServer",
    "Ren'Py Language Server",
    serverOptions,
    clientOptions
  );

  // Register the workspace setup command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "renpyDocHover.applyWorkspaceRecommendations",
      () => applyRecommendedWorkspaceSettings()
    )
  );

  // Start the client (which also launches the server)
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

/**
 * Apply recommended workspace settings for Ren'Py development
 */
async function applyRecommendedWorkspaceSettings(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage(
      "Ren'Py IntelliSense: open a workspace folder first."
    );
    return;
  }

  const vscodeDir = vscode.Uri.joinPath(folder.uri, ".vscode");
  const settingsUri = vscode.Uri.joinPath(vscodeDir, "settings.json");

  let current: Record<string, unknown> = {};
  try {
    const bytes = await vscode.workspace.fs.readFile(settingsUri);
    const text = new TextDecoder("utf-8").decode(bytes);
    current = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // File doesn't exist or invalid JSON
  }

  const merged: Record<string, unknown> = { ...current };

  // File associations
  const RECOMMENDED_FILES_ASSOCIATIONS: Record<string, string> = {
    "*.rpy": "renpy",
    "*.rpym": "renpy",
  };

  const prevAssoc = current["files.associations"];
  const assoc =
    typeof prevAssoc === "object" && prevAssoc !== null && !Array.isArray(prevAssoc)
      ? { ...(prevAssoc as Record<string, string>) }
      : {};
  merged["files.associations"] = { ...assoc, ...RECOMMENDED_FILES_ASSOCIATIONS };

  // Python analysis exclude
  const RECOMMENDED_PYTHON_EXCLUDE = ["**/*.rpy", "**/*.rpym"];
  const prevExclude = current["python.analysis.exclude"];
  const exclude = Array.isArray(prevExclude)
    ? [...new Set([...(prevExclude as unknown[]).map(String), ...RECOMMENDED_PYTHON_EXCLUDE])]
    : [...RECOMMENDED_PYTHON_EXCLUDE];
  merged["python.analysis.exclude"] = exclude;

  const json = JSON.stringify(merged, null, 2) + "\n";
  const encoded = new TextEncoder().encode(json);

  try {
    await vscode.workspace.fs.createDirectory(vscodeDir);
    await vscode.workspace.fs.writeFile(settingsUri, encoded);
  } catch (e) {
    void vscode.window.showErrorMessage(
      `Ren'Py IntelliSense: could not write .vscode/settings.json — ${String(e)}`
    );
    return;
  }

  const open = "Open settings";
  const choice = await vscode.window.showInformationMessage(
    "Ren'Py IntelliSense: updated .vscode/settings.json (Ren'Py file associations + Python analysis exclude). Reload the window or reopen .rpy files for full effect.",
    open
  );
  if (choice === open) {
    await vscode.commands.executeCommand("workbench.action.openWorkspaceSettingsFile");
  }
}
