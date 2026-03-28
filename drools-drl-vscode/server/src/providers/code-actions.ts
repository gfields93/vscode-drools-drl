/**
 * Code Actions / Quick Fixes provider for DRL files.
 *
 * Provides quick fixes for diagnostics:
 * - DRL103 (Unresolved import): suggest adding import from classpath
 * - DRL104 (Unused import): remove unused import
 * - DRL013 (Deprecated retract): replace with delete
 * - DRL101 (Unknown field): suggest closest matching field name
 * - DRL006/DRL201 (Duplicate rule): rename to unique name
 */

import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  TextEdit,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";

/**
 * Generate code actions for the given diagnostic context.
 */
export function getCodeActions(
  textDoc: TextDocument,
  params: CodeActionParams,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    switch (diagnostic.code) {
      case "DRL104":
        actions.push(...getRemoveUnusedImportActions(textDoc, diagnostic));
        break;
      case "DRL013":
        actions.push(...getReplaceRetractActions(textDoc, diagnostic));
        break;
      case "DRL101":
        actions.push(...getFixFieldNameActions(diagnostic));
        break;
      case "DRL006":
      case "DRL201":
        actions.push(...getRenameDuplicateRuleActions(textDoc, diagnostic));
        break;
      case "DRL103":
        actions.push(...getAddImportActions(diagnostic, doc, workspaceIndex));
        break;
      case "DRL014":
        actions.push(...getAddImportForTypeActions(diagnostic, doc, workspaceIndex));
        break;
    }
  }

  return actions;
}

// ── Quick fix implementations ─────────────────────────────────────────

/**
 * DRL104: Remove unused import.
 */
function getRemoveUnusedImportActions(
  textDoc: TextDocument,
  diagnostic: Diagnostic
): CodeAction[] {
  // Expand range to include the full line (including newline)
  const fullLineRange = Range.create(
    diagnostic.range.start.line,
    0,
    diagnostic.range.start.line + 1,
    0
  );

  return [
    {
      title: "Remove unused import",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [textDoc.uri]: [TextEdit.del(fullLineRange)],
        },
      },
      isPreferred: true,
    },
  ];
}

/**
 * DRL013: Replace deprecated retract with delete.
 */
function getReplaceRetractActions(
  textDoc: TextDocument,
  diagnostic: Diagnostic
): CodeAction[] {
  const text = textDoc.getText(diagnostic.range);
  if (!text.includes("retract")) return [];

  const newText = text.replace("retract", "delete");

  return [
    {
      title: "Replace `retract` with `delete`",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [textDoc.uri]: [TextEdit.replace(diagnostic.range, newText)],
        },
      },
      isPreferred: true,
    },
  ];
}

/**
 * DRL101: Suggest closest matching field name.
 */
function getFixFieldNameActions(diagnostic: Diagnostic): CodeAction[] {
  // Extract "Did you mean `fieldName`?" from the diagnostic message
  const match = diagnostic.message.match(/Did you mean `(\w+)`\?/);
  if (!match) return [];

  const suggestedField = match[1];

  return [
    {
      title: `Replace with \`${suggestedField}\``,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      // Note: We can't provide a precise edit here because the field name
      // position within the constraint isn't tracked in the diagnostic range.
      // This serves as a suggestion — the user can apply it manually.
    },
  ];
}

/**
 * DRL006/DRL201: Rename duplicate rule.
 */
function getRenameDuplicateRuleActions(
  textDoc: TextDocument,
  diagnostic: Diagnostic
): CodeAction[] {
  const match = diagnostic.message.match(/Rule "([^"]+)"/);
  if (!match) return [];

  const ruleName = match[1];
  const newName = `${ruleName}_2`;

  return [
    {
      title: `Rename to "${newName}"`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [textDoc.uri]: [
            TextEdit.replace(diagnostic.range, `"${newName}"`),
          ],
        },
      },
    },
  ];
}

/**
 * DRL103: Suggest adding import for unresolved type.
 * Searches the Java type index for types matching the simple name.
 */
function getAddImportActions(
  diagnostic: Diagnostic,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): CodeAction[] {
  // Extract the FQN from the diagnostic message
  const match = diagnostic.message.match(/Cannot resolve import `([^`]+)`/);
  if (match) return []; // Import itself is unresolved, no suggestion

  // For unresolved types in patterns, suggest imports
  const typeMatch = diagnostic.message.match(/Type `(\w+)` not found/);
  if (!typeMatch) return [];

  const simpleName = typeMatch[1];
  const candidates = workspaceIndex.javaTypeIndex.resolveBySimpleName(simpleName);
  if (candidates.length === 0) return [];

  const actions: CodeAction[] = [];

  for (const fqn of candidates) {
    // Find the position to insert the import (after the last existing import, or after package)
    const insertLine = findImportInsertLine(doc);
    const importText = `import ${fqn};\n`;

    actions.push({
      title: `Add import for \`${fqn}\``,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [doc.uri]: [
            TextEdit.insert({ line: insertLine, character: 0 }, importText),
          ],
        },
      },
    });
  }

  return actions;
}

/**
 * DRL014: Suggest adding import for a fact type used in a pattern but not imported.
 * Searches the Java type index for matching FQNs.
 */
function getAddImportForTypeActions(
  diagnostic: Diagnostic,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex
): CodeAction[] {
  const match = diagnostic.message.match(/Type `(\w+)` is not imported/);
  if (!match) return [];

  const simpleName = match[1];
  const candidates = workspaceIndex.javaTypeIndex.resolveBySimpleName(simpleName);
  const actions: CodeAction[] = [];

  for (const fqn of candidates) {
    const insertLine = findImportInsertLine(doc);
    const importText = `import ${fqn};\n`;

    actions.push({
      title: `Add import for \`${fqn}\``,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: candidates.length === 1,
      edit: {
        changes: {
          [doc.uri]: [
            TextEdit.insert({ line: insertLine, character: 0 }, importText),
          ],
        },
      },
    });
  }

  return actions;
}

// ── Utility functions ─────────────────────────────────────────────────

/**
 * Find the line number where a new import should be inserted.
 */
function findImportInsertLine(doc: DrlDocument): number {
  // After the last import
  if (doc.ast.imports.length > 0) {
    const lastImport = doc.ast.imports[doc.ast.imports.length - 1];
    return lastImport.range.endLine + 1;
  }

  // After the package declaration
  if (doc.ast.packageDecl) {
    return doc.ast.packageDecl.range.endLine + 2; // +2 for blank line
  }

  // Top of file
  return 0;
}
