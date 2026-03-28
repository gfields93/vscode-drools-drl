import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";

/**
 * Generate LSP diagnostics from a parsed DRL document.
 */
export function getDiagnostics(doc: DrlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. Parser/lexer errors
  for (const error of doc.ast.errors) {
    diagnostics.push({
      range: toLspRange(error.range),
      severity: mapSeverity(error.severity),
      message: error.message,
      source: "drools",
      code: error.code,
    });
  }

  // 2. Semantic checks
  checkDuplicateRuleNames(doc, diagnostics);
  checkEmptyConditions(doc, diagnostics);
  checkEmptyActions(doc, diagnostics);
  checkUnusedBindings(doc, diagnostics);
  checkUndeclaredBindingsInRhs(doc, diagnostics);
  checkDeprecatedRetract(doc, diagnostics);
  checkInvalidImports(doc, diagnostics);

  return diagnostics;
}

function mapSeverity(severity: AST.ParseError["severity"]): DiagnosticSeverity {
  switch (severity) {
    case "error": return DiagnosticSeverity.Error;
    case "warning": return DiagnosticSeverity.Warning;
    case "info": return DiagnosticSeverity.Information;
  }
}

/**
 * DRL006: Duplicate rule names within the same file.
 */
function checkDuplicateRuleNames(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  const seen = new Map<string, AST.RuleDeclaration>();
  for (const rule of doc.ast.rules) {
    const existing = seen.get(rule.name);
    if (existing) {
      diagnostics.push({
        range: toLspRange(rule.nameRange),
        severity: DiagnosticSeverity.Error,
        message: `Rule "${rule.name}" is already defined at line ${existing.nameRange.startLine + 1}`,
        source: "drools",
        code: "DRL006",
      });
    } else {
      seen.set(rule.name, rule);
    }
  }
}

/**
 * DRL007: Empty LHS (when block with no conditions).
 */
function checkEmptyConditions(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    if (rule.lhs.conditions.length === 0) {
      diagnostics.push({
        range: toLspRange(rule.lhs.range),
        severity: DiagnosticSeverity.Warning,
        message: `Rule "${rule.name}" has no conditions; it will fire unconditionally`,
        source: "drools",
        code: "DRL007",
      });
    }
  }
}

/**
 * DRL008: Empty RHS (then block with no actions).
 */
function checkEmptyActions(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    if (rule.rhs.actions.length === 0) {
      diagnostics.push({
        range: toLspRange(rule.rhs.range),
        severity: DiagnosticSeverity.Warning,
        message: `Rule "${rule.name}" has no actions`,
        source: "drools",
        code: "DRL008",
      });
    }
  }
}

/**
 * DRL010: Unused binding variables (declared in LHS but never used in RHS).
 */
function checkUnusedBindings(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    const bindings = doc.getBindingsInRule(rule);
    if (bindings.length === 0) continue;

    // Check if each binding appears in the RHS raw text or actions
    const rhsText = rule.rhs.rawText;
    for (const binding of bindings) {
      const name = binding.name;
      // Check in RHS actions' targetBinding
      const usedInAction = rule.rhs.actions.some(
        (a) => a.targetBinding === name
      );
      // Also check if the binding name appears in the raw RHS text
      const usedInText = rhsText.includes(name);
      // For now, skip this check if we don't have raw RHS text
      if (!usedInAction && !usedInText && rhsText.length > 0) {
        diagnostics.push({
          range: toLspRange(binding.range),
          severity: DiagnosticSeverity.Warning,
          message: `Binding variable "${name}" is declared but never used`,
          source: "drools",
          code: "DRL010",
        });
      }
    }
  }
}

/**
 * DRL011: Undeclared binding variables used in RHS.
 */
function checkUndeclaredBindingsInRhs(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    const bindings = doc.getBindingsInRule(rule);
    const declaredNames = new Set(bindings.map((b) => b.name));

    for (const action of rule.rhs.actions) {
      if (action.targetBinding && !declaredNames.has(action.targetBinding)) {
        diagnostics.push({
          range: toLspRange(action.range),
          severity: DiagnosticSeverity.Error,
          message: `Binding variable "${action.targetBinding}" is used in "then" but not declared in "when"`,
          source: "drools",
          code: "DRL011",
        });
      }
    }
  }
}

/**
 * DRL013: Deprecated retract usage.
 */
function checkDeprecatedRetract(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    for (const action of rule.rhs.actions) {
      if (action.type === "retract") {
        diagnostics.push({
          range: toLspRange(action.range),
          severity: DiagnosticSeverity.Warning,
          message: '`retract` is deprecated; use `delete` instead',
          source: "drools",
          code: "DRL013",
        });
      }
    }
  }
}

/**
 * DRL012: Invalid import statements.
 */
function checkInvalidImports(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const imp of doc.ast.imports) {
    if (!imp.target || imp.target.trim().length === 0) {
      diagnostics.push({
        range: toLspRange(imp.range),
        severity: DiagnosticSeverity.Error,
        message: "Could not parse import statement",
        source: "drools",
        code: "DRL012",
      });
    }
  }
}
