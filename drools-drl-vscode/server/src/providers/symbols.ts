import { DocumentSymbol, Range, SymbolKind } from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import { toLspRange } from "../utils/position";

/**
 * Provide document symbols for the Outline view and breadcrumb navigation.
 */
export function getDocumentSymbols(doc: DrlDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  // Package
  if (doc.ast.packageDecl) {
    const pkg = doc.ast.packageDecl;
    symbols.push({
      name: pkg.name,
      kind: SymbolKind.Package,
      range: toLspRange(pkg.range),
      selectionRange: toLspRange(pkg.range),
    });
  }

  // Unit
  if (doc.ast.unitDecl) {
    const unit = doc.ast.unitDecl;
    symbols.push({
      name: unit.name,
      detail: "unit",
      kind: SymbolKind.Namespace,
      range: toLspRange(unit.range),
      selectionRange: toLspRange(unit.range),
    });
  }

  // Imports
  for (const imp of doc.ast.imports) {
    symbols.push({
      name: imp.target,
      detail: imp.isFunction ? "function import" : "import",
      kind: SymbolKind.Module,
      range: toLspRange(imp.range),
      selectionRange: toLspRange(imp.range),
    });
  }

  // Globals
  for (const g of doc.ast.globals) {
    symbols.push({
      name: g.name,
      detail: g.type,
      kind: SymbolKind.Variable,
      range: toLspRange(g.range),
      selectionRange: toLspRange(g.range),
    });
  }

  // Type declarations
  for (const decl of doc.ast.declares) {
    const children: DocumentSymbol[] = [];
    for (const field of decl.fields) {
      children.push({
        name: field.name,
        detail: field.type,
        kind: SymbolKind.Field,
        range: toLspRange(field.range),
        selectionRange: toLspRange(field.range),
      });
    }
    const declRange = toLspRange(decl.range);
    symbols.push({
      name: decl.name,
      detail: decl.isTrait ? "trait" : decl.superType ? `extends ${decl.superType}` : "declare",
      kind: SymbolKind.Class,
      range: declRange,
      selectionRange: clampSelection(declRange, toLspRange(decl.nameRange)),
      children,
    });
  }

  // Rules
  for (const rule of doc.ast.rules) {
    const children: DocumentSymbol[] = [];

    // Attributes as children
    for (const attr of rule.attributes) {
      children.push({
        name: attr.name,
        detail: String(attr.value),
        kind: SymbolKind.Property,
        range: toLspRange(attr.range),
        selectionRange: toLspRange(attr.range),
      });
    }

    // When block
    if (rule.lhs.conditions.length > 0) {
      children.push({
        name: "when",
        detail: `${rule.lhs.conditions.length} condition(s)`,
        kind: SymbolKind.Event,
        range: toLspRange(rule.lhs.range),
        selectionRange: toLspRange(rule.lhs.range),
      });
    }

    // Then block
    if (rule.rhs.actions.length > 0) {
      children.push({
        name: "then",
        detail: `${rule.rhs.actions.length} action(s)`,
        kind: SymbolKind.Event,
        range: toLspRange(rule.rhs.range),
        selectionRange: toLspRange(rule.rhs.range),
      });
    }

    const ruleRange = toLspRange(rule.range);
    symbols.push({
      name: rule.name,
      detail: rule.parentRule ? `extends "${rule.parentRule}"` : undefined,
      kind: SymbolKind.Function,
      range: ruleRange,
      selectionRange: clampSelection(ruleRange, toLspRange(rule.nameRange)),
      children,
    });
  }

  // Queries
  for (const query of doc.ast.queries) {
    const queryRange = toLspRange(query.range);
    symbols.push({
      name: query.name,
      detail: query.parameters.length > 0
        ? `(${query.parameters.map((p) => `${p.type} ${p.name}`).join(", ")})`
        : undefined,
      kind: SymbolKind.Interface,
      range: queryRange,
      selectionRange: clampSelection(queryRange, toLspRange(query.nameRange)),
    });
  }

  // Functions
  for (const func of doc.ast.functions) {
    const funcRange = toLspRange(func.range);
    symbols.push({
      name: func.name,
      detail: `${func.returnType}(${func.parameters.map((p) => p.type).join(", ")})`,
      kind: SymbolKind.Method,
      range: funcRange,
      selectionRange: clampSelection(funcRange, toLspRange(func.nameRange)),
    });
  }

  return symbols;
}

/**
 * Ensure selectionRange is contained within fullRange.
 * VS Code rejects document symbols where this invariant is violated.
 */
function clampSelection(fullRange: Range, selectionRange: Range): Range {
  const startBefore =
    selectionRange.start.line < fullRange.start.line ||
    (selectionRange.start.line === fullRange.start.line &&
      selectionRange.start.character < fullRange.start.character);
  const endAfter =
    selectionRange.end.line > fullRange.end.line ||
    (selectionRange.end.line === fullRange.end.line &&
      selectionRange.end.character > fullRange.end.character);

  if (!startBefore && !endAfter) return selectionRange;
  return fullRange;
}
