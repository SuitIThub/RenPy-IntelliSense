/**
 * Ren'Py Language Server - Main entry point
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CompletionItem,
  Hover,
  SignatureHelp,
  Definition,
  Location,
  DocumentSymbol,
  TextDocumentPositionParams,
  CompletionParams,
  SignatureHelpParams,
  DefinitionParams,
  ReferenceParams,
  DocumentSymbolParams,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { RenpyServerSettings, DEFAULT_SETTINGS } from "@renpy-intellisense/shared";
import { ProjectIndex } from "./analysis/index";
import { provideHover } from "./features/hover";
import { provideCompletion } from "./features/completion";
import { provideSignatureHelp } from "./features/signatureHelp";
import { provideDefinition } from "./features/definition";
import { provideReferences } from "./features/references";
import { provideDocumentSymbols } from "./features/documentSymbol";

// Create the connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Create a document manager for full document sync
const documents = new TextDocuments(TextDocument);

// Create the project index
const projectIndex = new ProjectIndex();

// Track whether the client supports configuration
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// Global settings
let globalSettings: RenpyServerSettings = DEFAULT_SETTINGS;

// Per-document settings cache
const documentSettings: Map<string, Thenable<RenpyServerSettings>> = new Map();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Hover support
      hoverProvider: true,
      // Completion support
      completionProvider: {
        triggerCharacters: [".", "$"],
        resolveProvider: false,
      },
      // Signature help support
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
      // Go to Definition support
      definitionProvider: true,
      // Find All References support
      referencesProvider: true,
      // Document symbols for outline view
      documentSymbolProvider: true,
      // Workspace symbol search
      workspaceSymbolProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  // Index all workspace files
  if (hasWorkspaceFolderCapability) {
    const folders = await connection.workspace.getWorkspaceFolders();
    if (folders) {
      for (const folder of folders) {
        await projectIndex.indexWorkspaceFolder(folder.uri);
      }
    }
  }
});

// Get settings for a document
function getDocumentSettings(resource: string): Thenable<RenpyServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "renpyDocHover",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Handle configuration changes
connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = (change.settings.renpyDocHover || DEFAULT_SETTINGS) as RenpyServerSettings;
  }
});

// Handle document open
documents.onDidOpen((event) => {
  const doc = event.document;
  if (isRenpyFile(doc.uri)) {
    projectIndex.updateFileContent(doc.uri, doc.getText());
  }
});

// Handle document changes
documents.onDidChangeContent((change) => {
  const doc = change.document;
  if (isRenpyFile(doc.uri)) {
    projectIndex.updateFileContent(doc.uri, doc.getText());
  }
});

// Handle document save
documents.onDidSave((event) => {
  const doc = event.document;
  if (isRenpyFile(doc.uri)) {
    projectIndex.updateFileContent(doc.uri, doc.getText());
  }
});

// Handle document close
documents.onDidClose((event) => {
  documentSettings.delete(event.document.uri);
});

// Hover handler
connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return null;
  
  const settings = await getDocumentSettings(params.textDocument.uri);
  return provideHover(document, params.position, projectIndex, settings);
});

// Completion handler
connection.onCompletion(async (params: CompletionParams): Promise<CompletionItem[]> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return [];
  
  const settings = await getDocumentSettings(params.textDocument.uri);
  return provideCompletion(document, params.position, projectIndex, settings);
});

// Signature help handler
connection.onSignatureHelp(async (params: SignatureHelpParams): Promise<SignatureHelp | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return null;
  
  return provideSignatureHelp(document, params.position, projectIndex);
});

// Go to Definition handler
connection.onDefinition(async (params: DefinitionParams): Promise<Definition | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return null;
  
  // In complement mode, optionally disable our definition provider to avoid duplicates
  const settings = await getDocumentSettings(params.textDocument.uri);
  if (settings.complementMode && settings.complementModeDisableDefinition) {
    return null;
  }
  
  return provideDefinition(document, params.position, projectIndex);
});

// Find All References handler
connection.onReferences(async (params: ReferenceParams): Promise<Location[] | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return null;
  
  return provideReferences(document, params.position, projectIndex, params.context.includeDeclaration);
});

// Document symbols handler (for outline view)
connection.onDocumentSymbol(async (params: DocumentSymbolParams): Promise<DocumentSymbol[] | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRenpyFile(document.uri)) return null;
  
  return provideDocumentSymbols(document, projectIndex);
});

// Helper to check if a file is a Ren'Py file
function isRenpyFile(uri: string): boolean {
  const lower = uri.toLowerCase();
  return lower.endsWith(".rpy") || lower.endsWith(".rpym");
}

// Start listening
documents.listen(connection);
connection.listen();
