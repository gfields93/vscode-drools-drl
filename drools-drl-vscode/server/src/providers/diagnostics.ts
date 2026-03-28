import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { resolveImport } from "../analysis/import-resolver";

/**
 * Generate LSP diagnostics from a parsed DRL document.
 * When a workspace index is available, also runs type-aware and cross-file checks.
 */
export function getDiagnostics(
  doc: DrlDocument,
  workspaceIndex?: WorkspaceIndex
): Diagnostic[] {
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

  // 2. Single-file semantic checks
  checkDuplicateRuleNames(doc, diagnostics);
  checkEmptyConditions(doc, diagnostics);
  checkEmptyActions(doc, diagnostics);
  checkUnusedBindings(doc, diagnostics);
  checkUndeclaredBindingsInRhs(doc, diagnostics);
  checkDeprecatedRetract(doc, diagnostics);
  checkInvalidImports(doc, diagnostics);
  checkUnusedImports(doc, diagnostics);
  checkUnimportedFactTypes(doc, diagnostics);

  // 3. Type-aware and cross-file checks (Phase 3)
  if (workspaceIndex) {
    // Only check unresolved imports when we have types in the index
    if (workspaceIndex.javaTypeIndex.size > 0) {
      checkUnresolvedImports(doc, workspaceIndex, diagnostics);
      checkUnresolvedFieldNames(doc, workspaceIndex, diagnostics);
    }
    checkCrossFileDuplicateRules(doc, workspaceIndex, diagnostics);
  }

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
    if (ruleIncomplete(rule)) continue;
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
    if (ruleIncomplete(rule)) continue;
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
 * Detect rules where error recovery prevented full parsing.
 */
function ruleIncomplete(rule: AST.RuleDeclaration): boolean {
  return (
    rule.rhs.range.startLine === rule.range.startLine &&
    rule.rhs.range.startColumn === rule.range.startColumn
  );
}

/**
 * DRL010: Unused binding variables (declared in LHS but never used in RHS).
 */
function checkUnusedBindings(doc: DrlDocument, diagnostics: Diagnostic[]): void {
  for (const rule of doc.ast.rules) {
    if (ruleIncomplete(rule)) continue;
    const bindings = doc.getBindingsInRule(rule);
    if (bindings.length === 0) continue;

    const rhsText = rule.rhs.rawText;
    for (const binding of bindings) {
      const name = binding.name;
      const usedInAction = rule.rhs.actions.some(
        (a) => a.targetBinding === name
      );
      const usedInText = rhsText.includes(name);
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
    if (ruleIncomplete(rule)) continue;
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

// ── Phase 3: Type-aware diagnostics ───────────────────────────────────

/**
 * DRL103: Unresolved import — class not found on classpath.
 */
function checkUnresolvedImports(
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  for (const imp of doc.ast.imports) {
    if (!imp.target || imp.target.trim().length === 0) continue;

    const resolution = resolveImport(
      imp,
      (fqn) => workspaceIndex.javaTypeIndex.resolveType(fqn),
      (name) => workspaceIndex.javaTypeIndex.resolveBySimpleName(name)
    );

    if (!resolution.resolved && resolution.error) {
      diagnostics.push({
        range: toLspRange(imp.range),
        severity: DiagnosticSeverity.Error,
        message: resolution.error,
        source: "drools",
        code: resolution.code || "DRL103",
      });
    }
  }
}

/**
 * DRL101: Field doesn't exist on resolved type.
 * Only checks fields when the type is resolved from the Java type index.
 */
function checkUnresolvedFieldNames(
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  for (const rule of doc.ast.rules) {
    if (ruleIncomplete(rule)) continue;

    for (const cond of rule.lhs.conditions) {
      checkConditionFields(cond, doc, workspaceIndex, diagnostics);
    }
  }

  // Also check query conditions
  for (const query of doc.ast.queries) {
    for (const cond of query.conditions) {
      checkConditionFields(cond, doc, workspaceIndex, diagnostics);
    }
  }
}

function checkConditionFields(
  condition: AST.Condition,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  switch (condition.kind) {
    case "PatternCondition": {
      const fields = workspaceIndex.getFieldsForFactType(condition.factType, doc);
      if (fields.length === 0) break; // Type not resolved, skip validation

      // Parse field references from constraints
      const fieldRefs = extractFieldReferences(condition.constraints);
      const fieldNames = new Set(fields.map((f) => f.name));

      for (const ref of fieldRefs) {
        if (!fieldNames.has(ref.name)) {
          // Find the closest matching field name for "did you mean" suggestion
          const closest = findClosestMatch(ref.name, [...fieldNames]);
          const suggestion = closest
            ? `. Did you mean \`${closest}\`?`
            : `. Available fields: ${[...fieldNames].slice(0, 5).join(", ")}`;

          diagnostics.push({
            range: toLspRange(condition.range),
            severity: DiagnosticSeverity.Error,
            message: `Field \`${ref.name}\` does not exist on type \`${condition.factType}\`${suggestion}`,
            source: "drools",
            code: "DRL101",
          });
        }
      }
      break;
    }
    case "NotCondition":
      checkConditionFields(condition.condition, doc, workspaceIndex, diagnostics);
      break;
    case "ExistsCondition":
      checkConditionFields(condition.condition, doc, workspaceIndex, diagnostics);
      break;
    case "AndCondition":
      checkConditionFields(condition.left, doc, workspaceIndex, diagnostics);
      checkConditionFields(condition.right, doc, workspaceIndex, diagnostics);
      break;
    case "OrCondition":
      checkConditionFields(condition.left, doc, workspaceIndex, diagnostics);
      checkConditionFields(condition.right, doc, workspaceIndex, diagnostics);
      break;
    case "ForallCondition":
      for (const c of condition.conditions) {
        checkConditionFields(c, doc, workspaceIndex, diagnostics);
      }
      break;
    case "FromCondition":
      checkConditionFields(condition.pattern, doc, workspaceIndex, diagnostics);
      break;
  }
}

/**
 * DRL201: Cross-file duplicate rule names.
 */
function checkCrossFileDuplicateRules(
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  diagnostics: Diagnostic[]
): void {
  for (const rule of doc.ast.rules) {
    const allInstances = workspaceIndex.drlIndex.findAllRulesNamed(rule.name);
    const otherFiles = allInstances.filter((r) => r.uri !== doc.uri);

    if (otherFiles.length > 0) {
      const otherFileNames = otherFiles
        .map((r) => {
          const parts = r.uri.split("/");
          return parts[parts.length - 1];
        })
        .join(", ");

      diagnostics.push({
        range: toLspRange(rule.nameRange),
        severity: DiagnosticSeverity.Error,
        message: `Rule "${rule.name}" is also defined in: ${otherFileNames}`,
        source: "drools",
        code: "DRL201",
      });
    }
  }
}

/**
 * DRL104: Unused imports — imported type not referenced by any rule in this file.
 */
function checkUnusedImports(
  doc: DrlDocument,
  diagnostics: Diagnostic[]
): void {
  for (const imp of doc.ast.imports) {
    if (!imp.target || imp.isFunction || imp.isStatic) continue;
    if (imp.target.endsWith(".*")) continue; // Can't validate wildcard imports

    // Extract simple name from FQN
    const parts = imp.target.split(".");
    const simpleName = parts[parts.length - 1];

    // Check if this type is used in any rule condition or declared type
    const isUsed = isTypeReferencedInFile(simpleName, doc);
    if (!isUsed) {
      diagnostics.push({
        range: toLspRange(imp.range),
        severity: DiagnosticSeverity.Warning,
        message: `Import \`${imp.target}\` is not used by any rule`,
        source: "drools",
        code: "DRL104",
      });
    }
  }
}

/**
 * DRL014: Fact type used in a pattern is not imported or declared.
 */
function checkUnimportedFactTypes(
  doc: DrlDocument,
  diagnostics: Diagnostic[]
): void {
  // Build set of known type names: imported simple names + declared types + java.lang
  const knownTypes = new Set<string>();

  for (const imp of doc.ast.imports) {
    if (!imp.target) continue;
    if (imp.target.endsWith(".*")) {
      // Wildcard import — we can't enumerate, so skip validation for those packages
      knownTypes.add("*:" + imp.target.slice(0, -2));
      continue;
    }
    const parts = imp.target.split(".");
    knownTypes.add(parts[parts.length - 1]);
  }

  for (const decl of doc.ast.declares) {
    knownTypes.add(decl.name);
  }

  // Common java.lang types that are always implicitly available
  const javaLangTypes = [
    "Object", "String", "Integer", "Long", "Double", "Float",
    "Boolean", "Byte", "Short", "Character", "Number", "Comparable",
  ];
  for (const t of javaLangTypes) knownTypes.add(t);

  // Collect all fact types used in patterns
  const checked = new Set<string>();
  for (const rule of doc.ast.rules) {
    collectUnimportedTypes(rule.lhs.conditions, knownTypes, checked, doc.uri, diagnostics);
  }
  for (const query of doc.ast.queries) {
    collectUnimportedTypes(query.conditions, knownTypes, checked, doc.uri, diagnostics);
  }
}

function collectUnimportedTypes(
  conditions: AST.Condition[],
  knownTypes: Set<string>,
  checked: Set<string>,
  uri: string,
  diagnostics: Diagnostic[]
): void {
  for (const cond of conditions) {
    collectUnimportedFromCondition(cond, knownTypes, checked, uri, diagnostics);
  }
}

function collectUnimportedFromCondition(
  cond: AST.Condition,
  knownTypes: Set<string>,
  checked: Set<string>,
  uri: string,
  diagnostics: Diagnostic[]
): void {
  switch (cond.kind) {
    case "PatternCondition": {
      const typeName = cond.factType;
      if (checked.has(typeName)) break;
      checked.add(typeName);

      // Skip if it's a known type or a fully-qualified name
      if (knownTypes.has(typeName)) break;
      if (typeName.includes(".")) break;

      // Check if covered by a wildcard import
      const hasWildcard = [...knownTypes].some(
        (k) => k.startsWith("*:")
      );
      if (hasWildcard) break;

      diagnostics.push({
        range: toLspRange(cond.factTypeRange),
        severity: DiagnosticSeverity.Error,
        message: `Type \`${typeName}\` is not imported. Add an import statement or declare the type.`,
        source: "drools",
        code: "DRL014",
      });
      break;
    }
    case "NotCondition":
      collectUnimportedFromCondition(cond.condition, knownTypes, checked, uri, diagnostics);
      break;
    case "ExistsCondition":
      collectUnimportedFromCondition(cond.condition, knownTypes, checked, uri, diagnostics);
      break;
    case "AndCondition":
      collectUnimportedFromCondition(cond.left, knownTypes, checked, uri, diagnostics);
      collectUnimportedFromCondition(cond.right, knownTypes, checked, uri, diagnostics);
      break;
    case "OrCondition":
      collectUnimportedFromCondition(cond.left, knownTypes, checked, uri, diagnostics);
      collectUnimportedFromCondition(cond.right, knownTypes, checked, uri, diagnostics);
      break;
    case "ForallCondition":
      for (const c of cond.conditions) {
        collectUnimportedFromCondition(c, knownTypes, checked, uri, diagnostics);
      }
      break;
    case "FromCondition":
      collectUnimportedFromCondition(cond.pattern, knownTypes, checked, uri, diagnostics);
      break;
    case "AccumulateCondition":
      collectUnimportedFromCondition(cond.source, knownTypes, checked, uri, diagnostics);
      break;
  }
}

// ── Utility helpers ───────────────────────────────────────────────────

interface FieldReference {
  name: string;
}

/**
 * Extract field name references from a constraint string.
 * Handles constraints like: "age > 18, name != null, address.city == \"NYC\""
 */
function extractFieldReferences(constraints: string): FieldReference[] {
  if (!constraints || constraints.trim().length === 0) return [];

  const refs: FieldReference[] = [];
  const seen = new Set<string>();

  // Match identifiers that appear before operators or at the start of constraints
  // Pattern: word characters that are not preceded by $ (bindings), quotes, or dots
  const fieldPattern = /(?:^|,\s*)\s*([a-z]\w*)(?:\s*[><=!]|\s+(?:matches|contains|memberOf|soundslike|in|str)\b)/gi;

  let match;
  while ((match = fieldPattern.exec(constraints)) !== null) {
    const name = match[1];
    // Skip known keywords
    if (isConstraintKeyword(name)) continue;
    if (!seen.has(name)) {
      seen.add(name);
      refs.push({ name });
    }
  }

  return refs;
}

function isConstraintKeyword(name: string): boolean {
  const keywords = new Set([
    "true", "false", "null", "this",
    "not", "and", "or", "in", "from",
    "matches", "contains", "memberOf", "soundslike", "str",
    "eval", "new",
  ]);
  return keywords.has(name);
}

/**
 * Check if a type name is referenced anywhere in a DRL file.
 */
function isTypeReferencedInFile(simpleName: string, doc: DrlDocument): boolean {
  // Check rule conditions
  for (const rule of doc.ast.rules) {
    if (conditionReferencesType(rule.lhs.conditions, simpleName)) return true;
    // Check RHS raw text for type references (e.g. new Type())
    if (rule.rhs.rawText.includes(simpleName)) return true;
  }

  // Check query conditions
  for (const query of doc.ast.queries) {
    if (conditionReferencesType(query.conditions, simpleName)) return true;
  }

  // Check global types
  for (const g of doc.ast.globals) {
    if (g.type === simpleName) return true;
  }

  // Check declare extends
  for (const d of doc.ast.declares) {
    if (d.superType === simpleName) return true;
    for (const f of d.fields) {
      if (f.type === simpleName) return true;
    }
  }

  return false;
}

function conditionReferencesType(
  conditions: AST.Condition[],
  typeName: string
): boolean {
  for (const cond of conditions) {
    if (singleConditionReferencesType(cond, typeName)) return true;
  }
  return false;
}

function singleConditionReferencesType(
  cond: AST.Condition,
  typeName: string
): boolean {
  switch (cond.kind) {
    case "PatternCondition":
      return cond.factType === typeName;
    case "NotCondition":
      return singleConditionReferencesType(cond.condition, typeName);
    case "ExistsCondition":
      return singleConditionReferencesType(cond.condition, typeName);
    case "AndCondition":
      return (
        singleConditionReferencesType(cond.left, typeName) ||
        singleConditionReferencesType(cond.right, typeName)
      );
    case "OrCondition":
      return (
        singleConditionReferencesType(cond.left, typeName) ||
        singleConditionReferencesType(cond.right, typeName)
      );
    case "ForallCondition":
      return cond.conditions.some((c) => singleConditionReferencesType(c, typeName));
    case "FromCondition":
      return singleConditionReferencesType(cond.pattern, typeName);
    case "AccumulateCondition":
      return singleConditionReferencesType(cond.source, typeName);
    default:
      return false;
  }
}

/**
 * Find the closest matching string using Levenshtein distance.
 */
function findClosestMatch(target: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance && distance <= 3) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
