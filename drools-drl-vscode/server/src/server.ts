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
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "./model/drl-document";
import { getDiagnostics } from "./providers/diagnostics";
import { getCompletions } from "./providers/completion";
import { getHover } from "./providers/hover";
import { getDocumentSymbols } from "./providers/symbols";
import { formatDocument } from "./providers/formatting";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Cache of parsed DRL documents
const drlDocuments = new Map<string, DrlDocument>();

let validationEnabled = true;
let debounceMs = 200;
let indentSize = 4;
let insertFinalNewline = true;

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: [".", "(", "$", " ", ":", "@"],
        resolveProvider: false,
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.workspace.getConfiguration("drools").then((config) => {
    if (config) {
      validationEnabled = config.validation?.enabled ?? true;
      debounceMs = config.validation?.debounceMs ?? 200;
      indentSize = config.formatting?.indentSize ?? 4;
      insertFinalNewline = config.formatting?.insertFinalNewline ?? true;
    }
  });
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

  if (validationEnabled) {
    const diagnostics = getDiagnostics(doc);
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

// -- Completion -------------------------------------------------------

connection.onCompletion((params: CompletionParams) => {
  const doc = drlDocuments.get(params.textDocument.uri);
  if (!doc) return [];
  return getCompletions(doc, params);
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

// -- Formatting -------------------------------------------------------

connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  const textDoc = documents.get(params.textDocument.uri);
  if (!textDoc) return [];
  return formatDocument(textDoc, indentSize, insertFinalNewline);
});

documents.listen(connection);
connection.listen();
