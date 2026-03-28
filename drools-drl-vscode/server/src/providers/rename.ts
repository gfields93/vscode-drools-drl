/**
 * Rename provider for DRL files.
 *
 * Supports renaming:
 * - Binding variables ($person) — all references within the same rule
 * - Rule names — declaration + all extends references across workspace
 * - Declared type names — declaration + all pattern references + imports
 * - Global variables — declaration + all references across workspace
 * - Query names — declaration + all references across workspace
 * - Function names — declaration + all references across workspace
 *
 * Produces WorkspaceEdit that may span multiple files.
 */

import {
  WorkspaceEdit,
  TextEdit,
  Position,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";

/**
 * Check if the symbol at the given position can be renamed.
 * Returns the current name and range if renameable, null otherwise.
 */
export function prepareRename(
  textDoc: TextDocument,
  pos: Position,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): { range: Range; placeholder: string } | null {
  const word = getWordAtPosition(textDoc, pos);
  if (!word) return null;

  const wordRange = getWordRangeAtPosition(textDoc, pos);
  if (!wordRange) return null;

  // Check if this is a renameable symbol
  if (word.startsWith("$")) {
    // Binding variable
    const rule = doc.findRuleAt(pos);
    if (rule) {
      const bindings = doc.getBindingsInRule(rule);
      if (bindings.some((b) => b.name === word)) {
        return { range: wordRange, placeholder: word };
      }
    }
    return null;
  }

  // Rule name
  if (workspaceIndex.drlIndex.findRule(word)) {
    return { range: wordRange, placeholder: word };
  }

  // Declared type
  if (workspaceIndex.drlIndex.findDeclaredType(word)) {
    return { range: wordRange, placeholder: word };
  }

  // Global
  const allGlobals = workspaceIndex.drlIndex.getAllGlobals();
  if (allGlobals.some((g) => g.global.name === word)) {
    return { range: wordRange, placeholder: word };
  }

  // Query
  const allQueries = workspaceIndex.drlIndex.getAllQueries();
  if (allQueries.some((q) => q.query.name === word)) {
    return { range: wordRange, placeholder: word };
  }

  // Function
  const allFunctions = workspaceIndex.drlIndex.getAllFunctions();
  if (allFunctions.some((f) => f.func.name === word)) {
    return { range: wordRange, placeholder: word };
  }

  return null;
}

/**
 * Perform the rename operation, returning a WorkspaceEdit.
 */
export function getRename(
  textDoc: TextDocument,
  pos: Position,
  newName: string,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const word = getWordAtPosition(textDoc, pos);
  if (!word) return null;

  if (word.startsWith("$")) {
    return renameBinding(word, newName, pos, doc);
  }

  // Try each symbol type
  const ruleEdit = renameRule(word, newName, workspaceIndex);
  if (ruleEdit) return ruleEdit;

  const typeEdit = renameDeclaredType(word, newName, workspaceIndex);
  if (typeEdit) return typeEdit;

  const globalEdit = renameGlobal(word, newName, workspaceIndex);
  if (globalEdit) return globalEdit;

  const queryEdit = renameQuery(word, newName, workspaceIndex);
  if (queryEdit) return queryEdit;

  const funcEdit = renameFunction(word, newName, workspaceIndex);
  if (funcEdit) return funcEdit;

  return null;
}

// ── Rename implementations ────────────────────────────────────────────

function renameBinding(
  oldName: string,
  newName: string,
  pos: Position,
  doc: DrlDocument
): WorkspaceEdit | null {
  const rule = doc.findRuleAt(pos);
  if (!rule) return null;

  // Ensure new name starts with $
  const normalizedNew = newName.startsWith("$") ? newName : `$${newName}`;
  const changes: TextEdit[] = [];

  // Rename in LHS binding declarations
  const bindings = doc.getBindingsInRule(rule);
  for (const binding of bindings) {
    if (binding.name === oldName) {
      changes.push(TextEdit.replace(toLspRange(binding.range), normalizedNew));
    }
  }

  // Rename in RHS — use text-based replacement
  // We need the full document text to do precise replacement
  const rhsText = rule.rhs.rawText;
  if (rhsText) {
    const rhsStartLine = rule.rhs.range.startLine + 1; // skip 'then' line
    const lines = rhsText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let searchFrom = 0;
      while (true) {
        const idx = lines[i].indexOf(oldName, searchFrom);
        if (idx === -1) break;
        const before = idx > 0 ? lines[i][idx - 1] : " ";
        const after = idx + oldName.length < lines[i].length
          ? lines[i][idx + oldName.length]
          : " ";
        if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) {
          const line = rhsStartLine + i;
          changes.push(
            TextEdit.replace(
              Range.create(line, idx, line, idx + oldName.length),
              normalizedNew
            )
          );
        }
        searchFrom = idx + oldName.length;
      }
    }
  }

  if (changes.length === 0) return null;
  return { changes: { [doc.uri]: changes } };
}

function renameRule(
  oldName: string,
  newName: string,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const allRules = workspaceIndex.drlIndex.findAllRulesNamed(oldName);
  if (allRules.length === 0) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  // Rename rule declarations
  for (const entry of allRules) {
    if (!changes[entry.uri]) changes[entry.uri] = [];
    changes[entry.uri].push(
      TextEdit.replace(toLspRange(entry.rule.nameRange), `"${newName}"`)
    );
  }

  // Rename extends references
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      if (rule.parentRule === oldName) {
        // Find the extends clause and replace the parent rule name
        // parentRule is stored without quotes, but in the source it's quoted
        if (!changes[uri]) changes[uri] = [];
        // We need to find the extends reference in the source text
        const ruleText = doc.text.substring(0, rule.lhs.range.startLine);
        // The extends keyword and parent name are between nameRange and lhs range
        // For now, use a text search within the rule's range
        addTextReplacements(
          doc.text,
          `"${oldName}"`,
          `"${newName}"`,
          rule.range,
          uri,
          changes
        );
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

function renameDeclaredType(
  oldName: string,
  newName: string,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const decl = workspaceIndex.drlIndex.findDeclaredType(oldName);
  if (!decl) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  // Rename declaration
  if (!changes[decl.uri]) changes[decl.uri] = [];
  changes[decl.uri].push(
    TextEdit.replace(toLspRange(decl.decl.nameRange), newName)
  );

  // Rename in all pattern conditions across workspace
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      renameFactTypeInConditions(
        rule.lhs.conditions,
        oldName,
        newName,
        uri,
        changes
      );
    }

    for (const query of doc.ast.queries) {
      renameFactTypeInConditions(
        query.conditions,
        oldName,
        newName,
        uri,
        changes
      );
    }

    // Rename in imports
    for (const imp of doc.ast.imports) {
      if (imp.target.endsWith("." + oldName)) {
        if (!changes[uri]) changes[uri] = [];
        const newTarget = imp.target.replace(
          new RegExp(`\\.${escapeRegex(oldName)}$`),
          `.${newName}`
        );
        changes[uri].push(TextEdit.replace(toLspRange(imp.range), `import ${newTarget};`));
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

function renameGlobal(
  oldName: string,
  newName: string,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const allGlobals = workspaceIndex.drlIndex.getAllGlobals();
  const globalDecl = allGlobals.find((g) => g.global.name === oldName);
  if (!globalDecl) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  // Rename declaration
  if (!changes[globalDecl.uri]) changes[globalDecl.uri] = [];
  // Replace just the name part of the global declaration
  const globalRange = globalDecl.global.range;
  const doc = workspaceIndex.drlIndex.getDocument(globalDecl.uri);
  if (doc) {
    addTextReplacements(
      doc.text,
      oldName,
      newName,
      globalRange,
      globalDecl.uri,
      changes
    );
  }

  // Rename in all rules' RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const rDoc = workspaceIndex.drlIndex.getDocument(uri);
    if (!rDoc) continue;

    for (const rule of rDoc.ast.rules) {
      if (rule.rhs.rawText.includes(oldName)) {
        addTextReplacements(
          rDoc.text,
          oldName,
          newName,
          rule.rhs.range,
          uri,
          changes
        );
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

function renameQuery(
  oldName: string,
  newName: string,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const allQueries = workspaceIndex.drlIndex.getAllQueries();
  const queryDecl = allQueries.find((q) => q.query.name === oldName);
  if (!queryDecl) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  // Rename declaration
  if (!changes[queryDecl.uri]) changes[queryDecl.uri] = [];
  changes[queryDecl.uri].push(
    TextEdit.replace(toLspRange(queryDecl.query.nameRange), `"${newName}"`)
  );

  // Rename references in RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const rDoc = workspaceIndex.drlIndex.getDocument(uri);
    if (!rDoc) continue;

    for (const rule of rDoc.ast.rules) {
      if (rule.rhs.rawText.includes(oldName)) {
        addTextReplacements(rDoc.text, oldName, newName, rule.rhs.range, uri, changes);
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

function renameFunction(
  oldName: string,
  newName: string,
  workspaceIndex: WorkspaceIndex
): WorkspaceEdit | null {
  const allFunctions = workspaceIndex.drlIndex.getAllFunctions();
  const funcDecl = allFunctions.find((f) => f.func.name === oldName);
  if (!funcDecl) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  // Rename declaration
  if (!changes[funcDecl.uri]) changes[funcDecl.uri] = [];
  changes[funcDecl.uri].push(
    TextEdit.replace(toLspRange(funcDecl.func.nameRange), newName)
  );

  // Rename references in RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const rDoc = workspaceIndex.drlIndex.getDocument(uri);
    if (!rDoc) continue;

    for (const rule of rDoc.ast.rules) {
      if (rule.rhs.rawText.includes(oldName)) {
        addTextReplacements(rDoc.text, oldName, newName, rule.rhs.range, uri, changes);
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

// ── Utility functions ─────────────────────────────────────────────────

function renameFactTypeInConditions(
  conditions: AST.Condition[],
  oldName: string,
  newName: string,
  uri: string,
  changes: { [uri: string]: TextEdit[] }
): void {
  for (const cond of conditions) {
    renameFactTypeInCondition(cond, oldName, newName, uri, changes);
  }
}

function renameFactTypeInCondition(
  cond: AST.Condition,
  oldName: string,
  newName: string,
  uri: string,
  changes: { [uri: string]: TextEdit[] }
): void {
  switch (cond.kind) {
    case "PatternCondition":
      if (cond.factType === oldName) {
        if (!changes[uri]) changes[uri] = [];
        changes[uri].push(TextEdit.replace(toLspRange(cond.factTypeRange), newName));
      }
      break;
    case "NotCondition":
      renameFactTypeInCondition(cond.condition, oldName, newName, uri, changes);
      break;
    case "ExistsCondition":
      renameFactTypeInCondition(cond.condition, oldName, newName, uri, changes);
      break;
    case "AndCondition":
      renameFactTypeInCondition(cond.left, oldName, newName, uri, changes);
      renameFactTypeInCondition(cond.right, oldName, newName, uri, changes);
      break;
    case "OrCondition":
      renameFactTypeInCondition(cond.left, oldName, newName, uri, changes);
      renameFactTypeInCondition(cond.right, oldName, newName, uri, changes);
      break;
    case "ForallCondition":
      for (const c of cond.conditions) {
        renameFactTypeInCondition(c, oldName, newName, uri, changes);
      }
      break;
    case "FromCondition":
      renameFactTypeInCondition(cond.pattern, oldName, newName, uri, changes);
      break;
    case "AccumulateCondition":
      renameFactTypeInCondition(cond.source, oldName, newName, uri, changes);
      break;
  }
}

/**
 * Add text replacement edits for whole-word occurrences within a given AST range.
 */
function addTextReplacements(
  fullText: string,
  oldText: string,
  newText: string,
  range: AST.Range,
  uri: string,
  changes: { [uri: string]: TextEdit[] }
): void {
  const lines = fullText.split("\n");
  const pattern = new RegExp(`\\b${escapeRegex(oldText)}\\b`, "g");

  for (let lineNum = range.startLine; lineNum <= range.endLine && lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;
    while ((match = pattern.exec(line)) !== null) {
      if (!changes[uri]) changes[uri] = [];
      changes[uri].push(
        TextEdit.replace(
          Range.create(lineNum, match.index, lineNum, match.index + oldText.length),
          newText
        )
      );
    }
  }
}

function getWordAtPosition(textDoc: TextDocument, pos: Position): string | undefined {
  const line = textDoc.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line + 1, character: 0 },
  });

  const col = pos.character;
  if (col >= line.length) return undefined;

  let start = col;
  while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length && /[\w$]/.test(line[end])) end++;

  const word = line.slice(start, end).trim();
  return word.length > 0 ? word : undefined;
}

function getWordRangeAtPosition(textDoc: TextDocument, pos: Position): Range | undefined {
  const line = textDoc.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line + 1, character: 0 },
  });

  const col = pos.character;
  if (col >= line.length) return undefined;

  let start = col;
  while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length && /[\w$]/.test(line[end])) end++;

  if (start === end) return undefined;
  return Range.create(pos.line, start, pos.line, end);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
