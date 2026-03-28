/**
 * Go-to-Definition provider for DRL files.
 *
 * Supports navigation from:
 * - Fact type in LHS pattern → Java source file or DRL declare block
 * - Import statement → Java source file
 * - Binding variable in RHS → Binding declaration in LHS
 * - Rule name in extends → Parent rule declaration
 * - Global variable in RHS → Global declaration
 * - Function call in RHS → DRL function declaration
 * - Query name → Query declaration
 */

import {
  Location,
  Position,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";

/**
 * Resolve go-to-definition for the token at the given position.
 */
export function getDefinition(
  textDoc: TextDocument,
  pos: Position,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | Location[] | null {
  const word = getWordAtPosition(textDoc, pos);
  if (!word) return null;

  // 1. Check if cursor is on a binding variable in the RHS → go to LHS declaration
  const rule = doc.findRuleAt(pos);
  if (rule) {
    const bindingDef = findBindingDefinition(word, rule, doc);
    if (bindingDef) {
      return Location.create(doc.uri, toLspRange(bindingDef.range));
    }
  }

  // 2. Check if cursor is on a fact type in a pattern → go to Java source or DRL declare
  const factTypeDef = findFactTypeDefinition(word, doc, workspaceIndex);
  if (factTypeDef) return factTypeDef;

  // 3. Check if cursor is on an import target → go to Java source
  const importDef = findImportDefinition(word, pos, doc, workspaceIndex);
  if (importDef) return importDef;

  // 4. Check if cursor is on a rule extends reference → go to parent rule
  if (rule?.parentRule) {
    const parentDef = findRuleDefinition(rule.parentRule, workspaceIndex);
    if (parentDef && word === getLastWordOf(rule.parentRule)) {
      return parentDef;
    }
  }

  // 5. Check if cursor is on a global variable → go to declaration
  const globalDef = findGlobalDefinition(word, doc, workspaceIndex);
  if (globalDef) return globalDef;

  // 6. Check if cursor is on a function name → go to function declaration
  const funcDef = findFunctionDefinition(word, doc, workspaceIndex);
  if (funcDef) return funcDef;

  // 7. Check if cursor is on a query name → go to query declaration
  const queryDef = findQueryDefinition(word, doc, workspaceIndex);
  if (queryDef) return queryDef;

  // 8. Check if cursor is on a rule name → go to rule declaration
  const ruleDef = findRuleDefinition(word, workspaceIndex);
  if (ruleDef) return ruleDef;

  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────

function findBindingDefinition(
  word: string,
  rule: AST.RuleDeclaration,
  doc: DrlDocument
): AST.BindingVariable | undefined {
  if (!word.startsWith("$")) return undefined;
  const bindings = doc.getBindingsInRule(rule);
  return bindings.find((b) => b.name === word);
}

function findFactTypeDefinition(
  word: string,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | null {
  // Check DRL declared types first (in current file)
  for (const decl of doc.ast.declares) {
    if (decl.name === word) {
      return Location.create(doc.uri, toLspRange(decl.nameRange));
    }
  }

  // Check DRL declared types across workspace
  const indexedDecl = workspaceIndex.drlIndex.findDeclaredType(word);
  if (indexedDecl) {
    return Location.create(indexedDecl.uri, toLspRange(indexedDecl.decl.nameRange));
  }

  // Check Java type index
  const typeInfo = workspaceIndex.resolveFactType(word, doc);
  if (typeInfo?.sourceUri) {
    return createLocationFromSourceUri(typeInfo.sourceUri);
  }

  return null;
}

function findImportDefinition(
  word: string,
  pos: Position,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | null {
  // Check if cursor is within an import declaration
  for (const imp of doc.ast.imports) {
    if (!isPositionInAstRange(pos, imp.range)) continue;

    const fqn = imp.target;
    const typeInfo = workspaceIndex.javaTypeIndex.resolveType(fqn);
    if (typeInfo?.sourceUri) {
      return createLocationFromSourceUri(typeInfo.sourceUri);
    }

    // For DRL declared types referenced in imports
    const simpleName = fqn.split(".").pop();
    if (simpleName) {
      const indexedDecl = workspaceIndex.drlIndex.findDeclaredType(simpleName);
      if (indexedDecl) {
        return Location.create(indexedDecl.uri, toLspRange(indexedDecl.decl.nameRange));
      }
    }
  }

  return null;
}

function findRuleDefinition(
  name: string,
  workspaceIndex: WorkspaceIndex
): Location | null {
  const indexed = workspaceIndex.drlIndex.findRule(name);
  if (indexed) {
    return Location.create(indexed.uri, toLspRange(indexed.rule.nameRange));
  }
  return null;
}

function findGlobalDefinition(
  word: string,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | null {
  // Check current file
  for (const g of doc.ast.globals) {
    if (g.name === word) {
      return Location.create(doc.uri, toLspRange(g.range));
    }
  }

  // Check workspace
  const allGlobals = workspaceIndex.drlIndex.getAllGlobals();
  for (const g of allGlobals) {
    if (g.global.name === word) {
      return Location.create(g.uri, toLspRange(g.global.range));
    }
  }

  return null;
}

function findFunctionDefinition(
  word: string,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | null {
  // Check current file
  for (const f of doc.ast.functions) {
    if (f.name === word) {
      return Location.create(doc.uri, toLspRange(f.nameRange));
    }
  }

  // Check workspace
  const allFunctions = workspaceIndex.drlIndex.getAllFunctions();
  for (const f of allFunctions) {
    if (f.func.name === word) {
      return Location.create(f.uri, toLspRange(f.func.nameRange));
    }
  }

  return null;
}

function findQueryDefinition(
  word: string,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): Location | null {
  // Check current file
  for (const q of doc.ast.queries) {
    if (q.name === word) {
      return Location.create(doc.uri, toLspRange(q.nameRange));
    }
  }

  // Check workspace
  const allQueries = workspaceIndex.drlIndex.getAllQueries();
  for (const q of allQueries) {
    if (q.query.name === word) {
      return Location.create(q.uri, toLspRange(q.query.nameRange));
    }
  }

  return null;
}

// ── Utility functions ─────────────────────────────────────────────────

/**
 * Get the word (identifier or $binding) at the given position.
 */
function getWordAtPosition(textDoc: TextDocument, pos: Position): string | undefined {
  const line = textDoc.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line + 1, character: 0 },
  });

  // Find word boundaries at cursor position
  const col = pos.character;
  if (col >= line.length) return undefined;

  // Match identifiers including $ prefix for bindings
  let start = col;
  while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length && /[\w$]/.test(line[end])) end++;

  const word = line.slice(start, end).trim();
  return word.length > 0 ? word : undefined;
}

function isPositionInAstRange(pos: Position, range: AST.Range): boolean {
  if (pos.line < range.startLine || pos.line > range.endLine) return false;
  if (pos.line === range.startLine && pos.character < range.startColumn) return false;
  if (pos.line === range.endLine && pos.character > range.endColumn) return false;
  return true;
}

function getLastWordOf(text: string): string {
  const parts = text.split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Create a Location from a source URI (file path or file:// URI).
 * Points to line 0, col 0 since we don't track exact positions in Java sources.
 */
function createLocationFromSourceUri(sourceUri: string): Location {
  const uri = sourceUri.startsWith("file://")
    ? sourceUri
    : `file://${sourceUri}`;
  return Location.create(uri, Range.create(0, 0, 0, 0));
}
