import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";
import * as AST from "../parser/ast";
import { isNumericType, isStringType, isCollectionType, isBooleanType } from "../classpath/type-model";

/**
 * Provide context-sensitive code completions for DRL files.
 */
export function getCompletions(
  doc: DrlDocument,
  params: TextDocumentPositionParams,
  workspaceIndex?: WorkspaceIndex
): CompletionItem[] {
  const ctx = doc.getCursorContext(params.position);

  switch (ctx.type) {
    case "top-level":
      return getTopLevelCompletions();
    case "attributes":
      return getAttributeCompletions();
    case "lhs":
      return getLhsCompletions(doc, params, workspaceIndex);
    case "rhs":
      return getRhsCompletions(doc, ctx.rule, workspaceIndex);
    case "query":
      return getLhsCompletions(doc, params, workspaceIndex);
    default:
      return getTopLevelCompletions();
  }
}

function getTopLevelCompletions(): CompletionItem[] {
  return [
    {
      label: "rule",
      kind: CompletionItemKind.Keyword,
      detail: "Define a new rule",
      insertText: 'rule "${1:Rule Name}"\n    when\n        ${2}\n    then\n        ${3}\nend',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0rule",
    },
    {
      label: "query",
      kind: CompletionItemKind.Keyword,
      detail: "Define a new query",
      insertText: 'query "${1:Query Name}"\n    ${2}\nend',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0query",
    },
    {
      label: "declare",
      kind: CompletionItemKind.Keyword,
      detail: "Declare a new fact type",
      insertText: "declare ${1:TypeName}\n    ${2:field} : ${3:String}\nend",
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0declare",
    },
    {
      label: "function",
      kind: CompletionItemKind.Keyword,
      detail: "Define a DRL function",
      insertText: "function ${1:void} ${2:functionName}(${3}) {\n    ${4}\n}",
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0function",
    },
    {
      label: "package",
      kind: CompletionItemKind.Keyword,
      detail: "Package declaration",
      insertText: "package ${1:com.example.rules};",
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0apackage",
    },
    {
      label: "import",
      kind: CompletionItemKind.Keyword,
      detail: "Import statement",
      insertText: "import ${1:com.example.Type};",
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0bimport",
    },
    {
      label: "global",
      kind: CompletionItemKind.Keyword,
      detail: "Global variable declaration",
      insertText: "global ${1:Type} ${2:name};",
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0cglobal",
    },
  ];
}

function getAttributeCompletions(): CompletionItem[] {
  return [
    {
      label: "salience",
      kind: CompletionItemKind.Property,
      detail: "Rule priority (integer)",
      insertText: "salience ${1:0}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "no-loop",
      kind: CompletionItemKind.Property,
      detail: "Prevent rule re-activation by its own actions",
      insertText: "no-loop ${1:true}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "lock-on-active",
      kind: CompletionItemKind.Property,
      detail: "Prevent rule re-activation while agenda group is active",
      insertText: "lock-on-active ${1:true}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "agenda-group",
      kind: CompletionItemKind.Property,
      detail: "Assign rule to an agenda group",
      insertText: 'agenda-group "${1:group-name}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "activation-group",
      kind: CompletionItemKind.Property,
      detail: "Only one rule in the group can fire",
      insertText: 'activation-group "${1:group-name}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "ruleflow-group",
      kind: CompletionItemKind.Property,
      detail: "Assign rule to a ruleflow group",
      insertText: 'ruleflow-group "${1:group-name}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "dialect",
      kind: CompletionItemKind.Property,
      detail: "Set rule dialect",
      insertText: 'dialect "${1|java,mvel|}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "enabled",
      kind: CompletionItemKind.Property,
      detail: "Enable or disable rule",
      insertText: "enabled ${1:true}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "auto-focus",
      kind: CompletionItemKind.Property,
      detail: "Auto-focus agenda group when rule matches",
      insertText: "auto-focus ${1:true}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "date-effective",
      kind: CompletionItemKind.Property,
      detail: "Rule active after this date",
      insertText: 'date-effective "${1:01-Jan-2025}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "date-expires",
      kind: CompletionItemKind.Property,
      detail: "Rule expires after this date",
      insertText: 'date-expires "${1:31-Dec-2025}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "duration",
      kind: CompletionItemKind.Property,
      detail: "Delay before rule fires (ms)",
      insertText: "duration ${1:1000}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "timer",
      kind: CompletionItemKind.Property,
      detail: "Timer-based rule activation",
      insertText: 'timer (${1|int:,cron:|} ${2})',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "calendars",
      kind: CompletionItemKind.Property,
      detail: "Calendar-based rule activation",
      insertText: 'calendars "${1:calendar-name}"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "when",
      kind: CompletionItemKind.Keyword,
      detail: "Start conditions block",
      sortText: "1when",
    },
  ];
}

function getLhsCompletions(
  doc: DrlDocument,
  params: TextDocumentPositionParams,
  workspaceIndex?: WorkspaceIndex
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // LHS keywords
  const lhsKeywords = [
    { label: "not", detail: "Negated condition" },
    { label: "exists", detail: "Existence check" },
    { label: "and", detail: "Logical AND" },
    { label: "or", detail: "Logical OR" },
    { label: "eval", detail: "Evaluate a boolean expression" },
    { label: "forall", detail: "Universal quantifier" },
    { label: "from", detail: "Source for pattern" },
    { label: "collect", detail: "Collect matching facts" },
    { label: "accumulate", detail: "Aggregate values from matching facts" },
    { label: "over", detail: "Sliding window" },
    { label: "entry-point", detail: "Event entry point" },
  ];

  for (const kw of lhsKeywords) {
    items.push({
      label: kw.label,
      kind: CompletionItemKind.Keyword,
      detail: kw.detail,
      sortText: "3" + kw.label,
    });
  }

  // Constraint operators
  const operators = [
    { label: "matches", detail: "Regex match" },
    { label: "memberOf", detail: "Collection membership" },
    { label: "contains", detail: "Collection contains element" },
    { label: "soundslike", detail: "Phonetic match" },
    { label: "in", detail: "Value in list" },
  ];

  for (const op of operators) {
    items.push({
      label: op.label,
      kind: CompletionItemKind.Operator,
      detail: op.detail,
      sortText: "4" + op.label,
    });
  }

  // Known fact types from declares and imports
  for (const typeName of doc.getDeclaredTypeNames()) {
    items.push({
      label: typeName,
      kind: CompletionItemKind.Class,
      detail: "Declared type",
      insertText: `${typeName}( \${1} )`,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "2" + typeName,
    });
  }

  for (const typeName of doc.getImportedTypeNames()) {
    if (typeName === "*") continue;
    items.push({
      label: typeName,
      kind: CompletionItemKind.Class,
      detail: "Imported type",
      insertText: `${typeName}( \${1} )`,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "2" + typeName,
    });
  }

  // Accumulate functions
  const accFunctions = ["count", "sum", "avg", "min", "max", "collectList", "collectSet"];
  for (const fn of accFunctions) {
    items.push({
      label: fn,
      kind: CompletionItemKind.Function,
      detail: "Accumulate function",
      insertText: `${fn}( \${1} )`,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "5" + fn,
    });
  }

  // Field names from declared types
  for (const decl of doc.getDeclaredTypes()) {
    for (const field of decl.fields) {
      items.push({
        label: field.name,
        kind: CompletionItemKind.Field,
        detail: `${decl.name}.${field.name} : ${field.type}`,
        sortText: "0a" + field.name,
      });
    }
  }

  // Phase 3: Type-aware field completions from Java type index
  if (workspaceIndex) {
    addTypeAwareFieldCompletions(doc, params, workspaceIndex, items);
  }

  return items;
}

/**
 * Add field completions from resolved Java types when inside a pattern constraint.
 * E.g. Person(|) -> suggest age, name, etc. with type information.
 */
function addTypeAwareFieldCompletions(
  doc: DrlDocument,
  params: TextDocumentPositionParams,
  workspaceIndex: WorkspaceIndex,
  items: CompletionItem[]
): void {
  // Try to determine which fact type pattern the cursor is inside
  const rule = doc.findRuleAt(params.position);
  if (!rule) return;

  // Check each pattern condition to see if cursor is within it
  for (const cond of rule.lhs.conditions) {
    const patternType = findPatternAtPosition(cond, params.position, doc);
    if (patternType) {
      const fields = workspaceIndex.getFieldsForFactType(patternType, doc);
      const existingLabels = new Set(items.map((i) => i.label));

      for (const field of fields) {
        // Skip if we already have this field from DRL declares
        if (existingLabels.has(field.name)) continue;

        const typeDisplay = simplifyTypeName(field.type);
        const operatorSuggestion = getDefaultOperator(field.type);

        items.push({
          label: field.name,
          kind: CompletionItemKind.Field,
          detail: `${patternType}.${field.name} : ${typeDisplay}`,
          documentation: `Field from ${patternType} (${field.isReadOnly ? "read-only" : "read-write"})`,
          insertText: `${field.name} ${operatorSuggestion} \${1}`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: "0a" + field.name,
        });
      }

      // Also add type-specific operators after field names
      addTypeSpecificOperators(fields, items);
      break;
    }
  }
}

function getRhsCompletions(
  doc: DrlDocument,
  rule: { name: string },
  workspaceIndex?: WorkspaceIndex
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // RHS action keywords
  const actions = [
    {
      label: "insert",
      detail: "Insert a new fact",
      snippet: "insert( ${1:new Type()} );",
    },
    {
      label: "insertLogical",
      detail: "Insert a logically asserted fact",
      snippet: "insertLogical( ${1:new Type()} );",
    },
    {
      label: "modify",
      detail: "Modify a bound fact",
      snippet: "modify( ${1:\\$binding} ) {\n    ${2}\n};",
    },
    {
      label: "update",
      detail: "Update a fact in working memory",
      snippet: "update( ${1:\\$binding} );",
    },
    {
      label: "delete",
      detail: "Remove a fact from working memory",
      snippet: "delete( ${1:\\$binding} );",
    },
    {
      label: "retract",
      detail: "Remove a fact (deprecated, use delete)",
      snippet: "retract( ${1:\\$binding} );",
      deprecated: true,
    },
  ];

  for (const action of actions) {
    items.push({
      label: action.label,
      kind: CompletionItemKind.Function,
      detail: action.detail,
      insertText: action.snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: "0" + action.label,
      tags: action.deprecated ? [1] : undefined, // 1 = Deprecated
    });
  }

  // Binding variables from the rule's LHS
  const ruleDecl = doc.ast.rules.find((r) => r.name === rule.name);
  if (ruleDecl) {
    const bindings = doc.getBindingsInRule(ruleDecl);
    for (const binding of bindings) {
      items.push({
        label: binding.name,
        kind: CompletionItemKind.Variable,
        detail: "Binding variable",
        sortText: "0" + binding.name,
      });
    }

    // Phase 3: Add setter method completions for binding variables
    if (workspaceIndex) {
      addSetterCompletions(doc, ruleDecl, workspaceIndex, items);
    }
  }

  // Globals
  for (const g of doc.getGlobals()) {
    items.push({
      label: g.name,
      kind: CompletionItemKind.Variable,
      detail: `Global: ${g.type}`,
      sortText: "1" + g.name,
    });
  }

  return items;
}

/**
 * Add setter method completions for bound variables in the RHS.
 * E.g. inside modify($p) { | } -> suggest setAge(int), setName(String), etc.
 */
function addSetterCompletions(
  doc: DrlDocument,
  rule: AST.RuleDeclaration,
  workspaceIndex: WorkspaceIndex,
  items: CompletionItem[]
): void {
  const bindings = doc.getBindingsInRule(rule);

  for (const binding of bindings) {
    const typeInfo = workspaceIndex.resolveBindingType(binding.name, rule, doc);
    if (!typeInfo) continue;

    const methods = workspaceIndex.getMethodsForFactType(typeInfo.simpleName, doc);
    const setters = methods.filter(
      (m) => m.name.startsWith("set") && m.parameters.length > 0 && !m.isStatic
    );

    for (const setter of setters) {
      const paramTypes = setter.parameters
        .map((p) => simplifyTypeName(p.type))
        .join(", ");

      items.push({
        label: `${setter.name}(${paramTypes})`,
        kind: CompletionItemKind.Method,
        detail: `${binding.name}.${setter.name} → ${typeInfo.simpleName}`,
        insertText: `${setter.name}( \${1} )`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: "0b" + setter.name,
      });
    }
  }
}

// ── Utility helpers ───────────────────────────────────────────────────

import { isPositionInRange } from "../utils/position";
import { Position } from "vscode-languageserver";

/**
 * Find the fact type name if the cursor position is inside a pattern condition.
 */
function findPatternAtPosition(
  condition: AST.Condition,
  pos: Position,
  doc: DrlDocument
): string | undefined {
  switch (condition.kind) {
    case "PatternCondition":
      if (isPositionInRange(pos, condition.range)) {
        return condition.factType;
      }
      return undefined;
    case "NotCondition":
      return findPatternAtPosition(condition.condition, pos, doc);
    case "ExistsCondition":
      return findPatternAtPosition(condition.condition, pos, doc);
    case "AndCondition":
      return (
        findPatternAtPosition(condition.left, pos, doc) ||
        findPatternAtPosition(condition.right, pos, doc)
      );
    case "OrCondition":
      return (
        findPatternAtPosition(condition.left, pos, doc) ||
        findPatternAtPosition(condition.right, pos, doc)
      );
    case "ForallCondition":
      for (const c of condition.conditions) {
        const result = findPatternAtPosition(c, pos, doc);
        if (result) return result;
      }
      return undefined;
    case "FromCondition":
      return findPatternAtPosition(condition.pattern, pos, doc);
    default:
      return undefined;
  }
}

/**
 * Simplify a fully-qualified type name for display.
 * E.g. "java.lang.String" -> "String"
 */
function simplifyTypeName(typeName: string): string {
  const lastDot = typeName.lastIndexOf(".");
  if (lastDot >= 0) return typeName.slice(lastDot + 1);
  return typeName;
}

/**
 * Get a default comparison operator based on field type.
 */
function getDefaultOperator(typeName: string): string {
  if (isNumericType(typeName)) return ">";
  if (isBooleanType(typeName)) return "==";
  if (isStringType(typeName)) return "==";
  if (isCollectionType(typeName)) return "contains";
  return "==";
}

/**
 * Add type-specific constraint operators based on field types.
 */
function addTypeSpecificOperators(
  fields: { name: string; type: string }[],
  items: CompletionItem[]
): void {
  const hasNumeric = fields.some((f) => isNumericType(f.type));
  const hasString = fields.some((f) => isStringType(f.type));
  const hasCollection = fields.some((f) => isCollectionType(f.type));

  if (hasNumeric) {
    for (const op of [">", "<", ">=", "<=", "=="]) {
      items.push({
        label: op,
        kind: CompletionItemKind.Operator,
        detail: "Numeric comparison",
        sortText: "4" + op,
      });
    }
  }

  if (hasString) {
    items.push({
      label: "matches",
      kind: CompletionItemKind.Operator,
      detail: "Regex match (String)",
      sortText: "4matches",
    });
    items.push({
      label: "str",
      kind: CompletionItemKind.Operator,
      detail: "String operation",
      sortText: "4str",
    });
  }

  if (hasCollection) {
    items.push({
      label: "contains",
      kind: CompletionItemKind.Operator,
      detail: "Collection contains element",
      sortText: "4contains",
    });
    items.push({
      label: "memberOf",
      kind: CompletionItemKind.Operator,
      detail: "Element in collection",
      sortText: "4memberOf",
    });
  }
}
