import { Position } from "vscode-languageserver";
import { parse } from "../parser/parser";
import * as AST from "../parser/ast";
import { isPositionInRange } from "../utils/position";

/**
 * Represents a parsed DRL document with query methods for LSP providers.
 */
export class DrlDocument {
  public readonly ast: AST.DrlFile;

  constructor(
    public readonly uri: string,
    public readonly text: string,
  ) {
    this.ast = parse(text);
  }

  get packageName(): string | undefined {
    return this.ast.packageDecl?.name;
  }

  getRuleNames(): string[] {
    return this.ast.rules.map((r) => r.name);
  }

  getDeclaredTypes(): AST.TypeDeclaration[] {
    return this.ast.declares;
  }

  getDeclaredTypeNames(): string[] {
    return this.ast.declares.map((d) => d.name);
  }

  getImportedTypeNames(): string[] {
    return this.ast.imports.map((i) => {
      const parts = i.target.split(".");
      return parts[parts.length - 1];
    });
  }

  getGlobals(): AST.GlobalDeclaration[] {
    return this.ast.globals;
  }

  getBindingsInRule(rule: AST.RuleDeclaration): AST.BindingVariable[] {
    const bindings: AST.BindingVariable[] = [];
    for (const cond of rule.lhs.conditions) {
      this.collectBindings(cond, bindings);
    }
    return bindings;
  }

  /**
   * Find which rule (if any) contains the given position.
   */
  findRuleAt(pos: Position): AST.RuleDeclaration | undefined {
    return this.ast.rules.find((r) => isPositionInRange(pos, r.range));
  }

  /**
   * Find which query (if any) contains the given position.
   */
  findQueryAt(pos: Position): AST.QueryDeclaration | undefined {
    return this.ast.queries.find((q) => isPositionInRange(pos, q.range));
  }

  /**
   * Determine the cursor context within a rule for completion/hover.
   */
  getCursorContext(pos: Position): CursorContext {
    // Check if inside a rule
    const rule = this.findRuleAt(pos);
    if (rule) {
      if (isPositionInRange(pos, rule.rhs.range)) {
        return { type: "rhs", rule };
      }
      if (isPositionInRange(pos, rule.lhs.range)) {
        return { type: "lhs", rule };
      }
      // Between rule name and when — attribute area
      return { type: "attributes", rule };
    }

    // Check if inside a query
    const query = this.findQueryAt(pos);
    if (query) {
      return { type: "query", query };
    }

    return { type: "top-level" };
  }

  private collectBindings(condition: AST.Condition, bindings: AST.BindingVariable[]): void {
    switch (condition.kind) {
      case "PatternCondition":
        if (condition.binding) bindings.push(condition.binding);
        break;
      case "NotCondition":
        this.collectBindings(condition.condition, bindings);
        break;
      case "ExistsCondition":
        this.collectBindings(condition.condition, bindings);
        break;
      case "ForallCondition":
        for (const c of condition.conditions) this.collectBindings(c, bindings);
        break;
      case "FromCondition":
        this.collectBindings(condition.pattern, bindings);
        break;
      case "AndCondition":
        this.collectBindings(condition.left, bindings);
        this.collectBindings(condition.right, bindings);
        break;
      case "OrCondition":
        this.collectBindings(condition.left, bindings);
        this.collectBindings(condition.right, bindings);
        break;
    }
  }
}

export type CursorContext =
  | { type: "top-level" }
  | { type: "attributes"; rule: AST.RuleDeclaration }
  | { type: "lhs"; rule: AST.RuleDeclaration }
  | { type: "rhs"; rule: AST.RuleDeclaration }
  | { type: "query"; query: AST.QueryDeclaration };
