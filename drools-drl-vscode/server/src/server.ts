import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  TextDocumentChangeEvent,
  CompletionParams,
  TextDocumentPositionParams,
  DocumentSymbolParams,
  DocumentFormattingParams,
  DidChangeWatchedFilesParams,
  FileChangeType,
  DefinitionParams,
  ReferenceParams,
  RenameParams,
  PrepareRenameParams,
  CodeActionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "./model/drl-document";
import { getDiagnostics } from "./providers/diagnostics";
import { getCompletions } from "./providers/completion";
import { getHover } from "./providers/hover";
import { getDocumentSymbols } from "./providers/symbols";
import { formatDocument } from "./providers/formatting";
import { WorkspaceIndex } from "./workspace/workspace-index";
import { processFileChanges, FileChangeEvent } from "./workspace/file-watcher";
import { getDefinition } from "./providers/definition";
import { getReferences } from "./providers/references";
import { prepareRename, getRename } from "./providers/rename";
import { getCodeActions } from "./providers/code-actions";
import { analyzeRules, getRuleDependencies } from "./analysis/rule-analyzer";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Cache of parsed DRL documents (for open editors)
const drlDocuments = new Map<string, DrlDocument>();

// Workspace index for cross-file intelligence
const workspaceIndex = new WorkspaceIndex();

let validationEnabled = true;
let debounceMs = 200;
let indentSize = 4;
let insertFinalNewline = true;

let workspaceRoot: string | undefined;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Extract workspace root
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    const folderUri = params.workspaceFolders[0].uri;
    workspaceRoot = folderUri.startsWith("file://")
      ? decodeURIComponent(folderUri.slice(7))
      : folderUri;
  } else if (params.rootUri) {
    workspaceRoot = params.rootUri.startsWith("file://")
      ? decodeURIComponent(params.rootUri.slice(7))
      : params.rootUri;
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: [".", "(", "$", " ", ":", "@"],
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      codeActionProvider: {
        codeActionKinds: ["quickfix"],
      },
      documentSymbolProvider: true,
      documentFormattingProvider: true,
    },
  };
});

connection.onInitialized(async () => {
  // Read configuration
  const config = await connection.workspace.getConfiguration("drools");
  if (config) {
    validationEnabled = config.validation?.enabled ?? true;
    debounceMs = config.validation?.debounceMs ?? 200;
    indentSize = config.formatting?.indentSize ?? 4;
    insertFinalNewline = config.formatting?.insertFinalNewline ?? true;
  }

  // Initialize workspace index in the background
  if (workspaceRoot) {
    const classpathConfig = {
      mode: config?.java?.classpath ?? "auto",
      manualClasspath: config?.java?.manualClasspath ?? [],
      sourceRoots: config?.java?.sourceRoots ?? ["src/main/java"],
    };

    workspaceIndex.setProgressCallback((message, percentage) => {
      connection.console.log(`[Index] ${message} (${percentage}%)`);
    });

    try {
      await workspaceIndex.initialize(workspaceRoot, classpathConfig);
      const status = workspaceIndex.getStatus();
      connection.console.log(
        `[Index] Ready: ${status.drlFileCount} DRL files, ` +
        `${status.javaTypeCount} Java types, ` +
        `project type: ${status.projectType}`
      );
    } catch (err) {
      connection.console.error(
        `[Index] Initialization failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }
});

// -- Document validation with debounce --------------------------------

const pendingValidations = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleValidation(uri: string, text: string): void {
  const existing = pendingValidations.get(uri);
  if (existing) clearTimeout(existing);

  pendingValidations.set(
    uri,
    setTimeout(() => {
      validateDocument(uri, text);
      pendingValidations.delete(uri);
    }, debounceMs)
  );
}

function validateDocument(uri: string, text: string): void {
  const doc = new DrlDocument(uri, text);
  drlDocuments.set(uri, doc);

  // Also update the workspace index
  workspaceIndex.updateDrlDocument(uri, text);

  if (validationEnabled) {
    const diagnostics = getDiagnostics(doc, workspaceIndex);
    connection.sendDiagnostics({ uri, diagnostics });
  }
}

documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
  scheduleValidation(change.document.uri, change.document.getText());
});

documents.onDidClose((event) => {
  drlDocuments.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// -- File watcher notifications (for non-DRL files) -------------------

connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  const events: FileChangeEvent[] = params.changes.map((change) => ({
    uri: change.uri,
    type:
      change.type === FileChangeType.Created
        ? "created"
        : change.type === FileChangeType.Changed
        ? "changed"
        : "deleted",
  }));

  const result = processFileChanges(events, workspaceIndex);

  // If classpath files changed, trigger a full classpath rebuild
  if (result.classpathChanged) {
    workspaceIndex.rebuildClasspath().then(() => {
      connection.console.log("[Index] Classpath rebuilt");
    });
  }

  // Re-validate open DRL documents if Java types changed
  if (result.javaChanged) {
    for (const [uri, doc] of drlDocuments) {
      if (validationEnabled) {
        const diagnostics = getDiagnostics(doc, workspaceIndex);
        connection.sendDiagnostics({ uri, diagnostics });
      }
    }
  }
});

// -- Custom commands --------------------------------------------------

connection.onRequest("drools/rebuildWorkspaceIndex", async () => {
  if (workspaceRoot) {
    await workspaceIndex.initialize(workspaceRoot);
    return workspaceIndex.getStatus();
  }
  return { error: "No workspace root" };
});

connection.onRequest("drools/rebuildClasspath", async () => {
  await workspaceIndex.rebuildClasspath();
  return workspaceIndex.getStatus();
});

connection.onRequest("drools/showTypeInfo", (params: { typeName: string; uri: string }) => {
  const doc = drlDocuments.get(params.uri);
  if (!doc) return null;
  const typeInfo = workspaceIndex.resolveFactType(params.typeName, doc);
  return typeInfo || null;
});

connection.onRequest("drools/analyzeRuleConflicts", () => {
  return analyzeRules(workspaceIndex.drlIndex);
});

connection.onRequest("drools/showRuleDependencies", (params: { ruleName: string }) => {
  return getRuleDependencies(params.ruleName, workspaceIndex.drlIndex) || null;
});

connection.onRequest("drools/listAllRules", () => {
  const rules: { name: string; uri: string; salience: number; agendaGroup: string }[] = [];
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;
    for (const rule of doc.ast.rules) {
      const salienceAttr = rule.attributes.find((a) => a.name === "salience");
      const agendaAttr = rule.attributes.find((a) => a.name === "agenda-group");
      rules.push({
        name: rule.name,
        uri,
        salience: salienceAttr ? Number(salienceAttr.value) || 0 : 0,
        agendaGroup: agendaAttr ? String(agendaAttr.value) : "",
      });
    }
  }
  return rules;
});

// -- Completion -------------------------------------------------------

connection.onCompletion((params: CompletionParams) => {
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!doc) return [];
  return getCompletions(doc, params, workspaceIndex);
});

// -- Hover ------------------------------------------------------------

connection.onHover((params: TextDocumentPositionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return null;
  return getHover(textDoc, params);
});

// -- Document Symbols -------------------------------------------------

connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!doc) return [];
  return getDocumentSymbols(doc);
});

// -- Go-to-Definition -------------------------------------------------

connection.onDefinition((params: DefinitionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!textDoc || !doc) return null;
  return getDefinition(textDoc, params.position, doc, workspaceIndex);
});

// -- Find References --------------------------------------------------

connection.onReferences((params: ReferenceParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!textDoc || !doc) return [];
  return getReferences(
    textDoc,
    params.position,
    doc,
    workspaceIndex,
    params.context.includeDeclaration
  );
});

// -- Rename -----------------------------------------------------------

connection.onPrepareRename((params: PrepareRenameParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!textDoc || !doc) return null;
  return prepareRename(textDoc, params.position, doc, workspaceIndex);
});

connection.onRenameRequest((params: RenameParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!textDoc || !doc) return null;
  return getRename(textDoc, params.position, params.newName, doc, workspaceIndex);
});

// -- Code Actions -----------------------------------------------------

connection.onCodeAction((params: CodeActionParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!textDoc || !doc) return [];
  return getCodeActions(textDoc, params, doc, workspaceIndex);
});

// -- Formatting -------------------------------------------------------

connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  return formatDocument(textDoc, indentSize, insertFinalNewline);
});

documents.listen(connection);
connection.listen();
