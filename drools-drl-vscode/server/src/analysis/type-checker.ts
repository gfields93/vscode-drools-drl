/**
 * Constraint Type Checker.
 *
 * Validates type compatibility in DRL constraint expressions.
 * Detects type mismatches like comparing a String field with a numeric literal,
 * or using numeric operators on boolean fields.
 */

import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";
import {
  isNumericType,
  isStringType,
  isBooleanType,
  isCollectionType,
  JavaFieldInfo,
} from "../classpath/type-model";

/**
 * Run type checking on constraints within pattern conditions.
 * Produces DRL102 warnings for type mismatches.
 */
export function checkConstraintTypes(
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  for (const rule of doc.ast.rules) {
    for (const cond of rule.lhs.conditions) {
      checkConditionTypes(cond, doc, workspaceIndex, diagnostics);
    }
  }

  for (const query of doc.ast.queries) {
    for (const cond of query.conditions) {
      checkConditionTypes(cond, doc, workspaceIndex, diagnostics);
    }
  }
}

function checkConditionTypes(
  cond: AST.Condition,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  switch (cond.kind) {
    case "PatternCondition": {
      const fields = workspaceIndex.getFieldsForFactType(cond.factType, doc);
      if (fields.length === 0) break;

      const fieldMap = new Map<string, JavaFieldInfo>();
      for (const f of fields) fieldMap.set(f.name, f);

      checkPatternConstraintTypes(cond, fieldMap, diagnostics);
      break;
    }
    case "NotCondition":
      checkConditionTypes(cond.condition, doc, workspaceIndex, diagnostics);
      break;
    case "ExistsCondition":
      checkConditionTypes(cond.condition, doc, workspaceIndex, diagnostics);
      break;
    case "AndCondition":
      checkConditionTypes(cond.left, doc, workspaceIndex, diagnostics);
      checkConditionTypes(cond.right, doc, workspaceIndex, diagnostics);
      break;
    case "OrCondition":
      checkConditionTypes(cond.left, doc, workspaceIndex, diagnostics);
      checkConditionTypes(cond.right, doc, workspaceIndex, diagnostics);
      break;
    case "ForallCondition":
      for (const c of cond.conditions) {
        checkConditionTypes(c, doc, workspaceIndex, diagnostics);
      }
      break;
    case "FromCondition":
      checkConditionTypes(cond.pattern, doc, workspaceIndex, diagnostics);
      break;
  }
}

function checkPatternConstraintTypes(
  pattern: AST.PatternCondition,
  fieldMap: Map<string, JavaFieldInfo>,
  diagnostics: Diagnostic[]
): void {
  const constraints = pattern.constraints;
  if (!constraints) return;

  // Match: fieldName operator value
  const compPattern =
    /(\w+)\s*(==|!=|>=?|<=?|matches|contains|memberOf|soundslike|str)\s+(?:"([^"]+)"|(\d+(?:\.\d+)?)|(true|false)|null)/g;

  let match;
  while ((match = compPattern.exec(constraints)) !== null) {
    const fieldName = match[1];
    const operator = match[2];
    const stringVal = match[3];
    const numericVal = match[4];
    const boolVal = match[5];

    const field = fieldMap.get(fieldName);
    if (!field) continue;

    const fieldType = field.type;

    // Check: numeric operator on non-numeric field
    if ((operator === ">" || operator === "<" || operator === ">=" || operator === "<=")) {
      if (numericVal === undefined && !isNumericType(fieldType)) {
        diagnostics.push({
          range: toLspRange(pattern.range),
          severity: DiagnosticSeverity.Warning,
          message:
            `Comparing \`${fieldName}\` (type \`${fieldType}\`) with operator \`${operator}\` — ` +
            `field type may not support numeric comparison`,
          source: "drools",
          code: "DRL102",
        });
      }
    }

    // Check: string value on numeric field
    if (stringVal !== undefined && isNumericType(fieldType)) {
      diagnostics.push({
        range: toLspRange(pattern.range),
        severity: DiagnosticSeverity.Warning,
        message:
          `Comparing \`${fieldName}\` (type \`${fieldType}\`) with String value "${stringVal}"`,
        source: "drools",
        code: "DRL102",
      });
    }

    // Check: numeric value on string field
    if (numericVal !== undefined && isStringType(fieldType)) {
      diagnostics.push({
        range: toLspRange(pattern.range),
        severity: DiagnosticSeverity.Warning,
        message:
          `Comparing \`${fieldName}\` (type \`${fieldType}\`) with numeric value ${numericVal}`,
        source: "drools",
        code: "DRL102",
      });
    }

    // Check: matches/soundslike on non-string field
    if ((operator === "matches" || operator === "soundslike") && !isStringType(fieldType)) {
      diagnostics.push({
        range: toLspRange(pattern.range),
        severity: DiagnosticSeverity.Warning,
        message:
          `Operator \`${operator}\` used on \`${fieldName}\` (type \`${fieldType}\`) — ` +
          `only valid for String fields`,
        source: "drools",
        code: "DRL102",
      });
    }

    // Check: contains/memberOf on non-collection field
    if (operator === "contains" && !isCollectionType(fieldType)) {
      diagnostics.push({
        range: toLspRange(pattern.range),
        severity: DiagnosticSeverity.Warning,
        message:
          `Operator \`contains\` used on \`${fieldName}\` (type \`${fieldType}\`) — ` +
          `typically used with Collection types`,
        source: "drools",
        code: "DRL102",
      });
    }
  }
}
