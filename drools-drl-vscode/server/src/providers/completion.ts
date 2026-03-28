import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";

/**
 * Provide context-sensitive code completions for DRL files.
 */
export function getCompletions(
  doc: DrlDocument,
  params: TextDocumentPositionParams
): CompletionItem[] {
  const ctx = doc.getCursorContext(params.position);

  switch (ctx.type) {
    case "top-level":
      return getTopLevelCompletions();
    case "attributes":
      return getAttributeCompletions();
    case "lhs":
      return getLhsCompletions(doc);
    case "rhs":
      return getRhsCompletions(doc, ctx.rule);
    case "query":
      return getLhsCompletions(doc);
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

function getLhsCompletions(doc: DrlDocument): CompletionItem[] {
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
      sortText: "1" + kw.label,
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
      sortText: "2" + op.label,
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
      sortText: "0" + typeName,
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
      sortText: "0" + typeName,
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
      sortText: "3" + fn,
    });
  }

  // Field names from declared types
  for (const decl of doc.getDeclaredTypes()) {
    for (const field of decl.fields) {
      items.push({
        label: field.name,
        kind: CompletionItemKind.Field,
        detail: `${decl.name}.${field.name} : ${field.type}`,
        sortText: "0" + field.name,
      });
    }
  }

  return items;
}

function getRhsCompletions(
  doc: DrlDocument,
  rule: { name: string }
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
