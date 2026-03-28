/**
 * DRL Index.
 *
 * Maintains a cross-file index of all DRL constructs (rules, declared types,
 * imports, globals, queries, functions) across the workspace. Supports queries
 * for duplicate detection, reference finding, and cross-file navigation.
 */

import { Range } from "vscode-languageserver";
import { DrlDocument } from "../model/drl-document";
import * as AST from "../parser/ast";
import { toLspRange } from "../utils/position";

export interface IndexedRule {
  uri: string;
  rule: AST.RuleDeclaration;
}

export interface IndexedType {
  uri: string;
  decl: AST.TypeDeclaration;
}

export interface IndexedGlobal {
  uri: string;
  global: AST.GlobalDeclaration;
}

export interface IndexedQuery {
  uri: string;
  query: AST.QueryDeclaration;
}

export interface IndexedFunction {
  uri: string;
  func: AST.FunctionDeclaration;
}

export interface DuplicateRuleName {
  name: string;
  locations: { uri: string; range: Range }[];
}

export class DrlIndex {
  /** All parsed DRL documents by URI */
  private documents = new Map<string, DrlDocument>();

  // Cross-file indexes (rebuilt on changes)
  private rulesByName = new Map<string, IndexedRule[]>();
  private declaredTypes = new Map<string, IndexedType>();
  private importedTypes = new Map<string, Set<string>>(); // FQN -> set of URIs
  private globalsByName = new Map<string, IndexedGlobal>();
  private querysByName = new Map<string, IndexedQuery>();
  private functionsByName = new Map<string, IndexedFunction>();

  /**
   * Add or update a document in the index.
   */
  updateDocument(uri: string, doc: DrlDocument): void {
    // Remove old entries for this URI first
    this.removeDocument(uri);

    this.documents.set(uri, doc);
    this.indexDocument(uri, doc);
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(uri: string): void {
    const doc = this.documents.get(uri);
    if (!doc) return;

    // Remove rules
    for (const rule of doc.ast.rules) {
      const entries = this.rulesByName.get(rule.name);
      if (entries) {
        const filtered = entries.filter((e) => e.uri !== uri);
        if (filtered.length === 0) this.rulesByName.delete(rule.name);
        else this.rulesByName.set(rule.name, filtered);
      }
    }

    // Remove declared types
    for (const decl of doc.ast.declares) {
      const existing = this.declaredTypes.get(decl.name);
      if (existing && existing.uri === uri) {
        this.declaredTypes.delete(decl.name);
      }
    }

    // Remove imports
    for (const imp of doc.ast.imports) {
      const uris = this.importedTypes.get(imp.target);
      if (uris) {
        uris.delete(uri);
        if (uris.size === 0) this.importedTypes.delete(imp.target);
      }
    }

    // Remove globals
    for (const g of doc.ast.globals) {
      const existing = this.globalsByName.get(g.name);
      if (existing && existing.uri === uri) {
        this.globalsByName.delete(g.name);
      }
    }

    // Remove queries
    for (const q of doc.ast.queries) {
      const existing = this.querysByName.get(q.name);
      if (existing && existing.uri === uri) {
        this.querysByName.delete(q.name);
      }
    }

    // Remove functions
    for (const f of doc.ast.functions) {
      const existing = this.functionsByName.get(f.name);
      if (existing && existing.uri === uri) {
        this.functionsByName.delete(f.name);
      }
    }

    this.documents.delete(uri);
  }

  /**
   * Rebuild the entire index from all documents.
   */
  rebuildIndex(): void {
    const docs = new Map(this.documents);
    this.clearIndexes();
    for (const [uri, doc] of docs) {
      this.documents.set(uri, doc);
      this.indexDocument(uri, doc);
    }
  }

  // ── Query methods ───────────────────────────────────────────────────

  /**
   * Find a rule by name across all files.
   */
  findRule(name: string): IndexedRule | undefined {
    const entries = this.rulesByName.get(name);
    return entries?.[0];
  }

  /**
   * Find all rules with a given name (for duplicate detection).
   */
  findAllRulesNamed(name: string): IndexedRule[] {
    return this.rulesByName.get(name) || [];
  }

  /**
   * Find a declared type by name.
   */
  findDeclaredType(name: string): IndexedType | undefined {
    return this.declaredTypes.get(name);
  }

  /**
   * Find all rules in a given agenda group.
   */
  findAllRulesInAgendaGroup(group: string): IndexedRule[] {
    const result: IndexedRule[] = [];
    for (const entries of this.rulesByName.values()) {
      for (const entry of entries) {
        const attr = entry.rule.attributes.find(
          (a) => a.name === "agenda-group" && a.value === group
        );
        if (attr) result.push(entry);
      }
    }
    return result;
  }

  /**
   * Find all rules that reference a given fact type in their LHS conditions.
   */
  findAllRulesUsingFactType(typeName: string): IndexedRule[] {
    const result: IndexedRule[] = [];
    for (const entries of this.rulesByName.values()) {
      for (const entry of entries) {
        if (ruleUsesFactType(entry.rule, typeName)) {
          result.push(entry);
        }
      }
    }
    return result;
  }

  /**
   * Get all rule names that appear more than once across files.
   */
  getDuplicateRuleNames(): DuplicateRuleName[] {
    const duplicates: DuplicateRuleName[] = [];
    for (const [name, entries] of this.rulesByName) {
      if (entries.length > 1) {
        duplicates.push({
          name,
          locations: entries.map((e) => ({
            uri: e.uri,
            range: toLspRange(e.rule.nameRange),
          })),
        });
      }
    }
    return duplicates;
  }

  /**
   * Get all import FQNs collected across all files.
   */
  getAllImportedFqns(): string[] {
    return [...this.importedTypes.keys()];
  }

  /**
   * Get document by URI.
   */
  getDocument(uri: string): DrlDocument | undefined {
    return this.documents.get(uri);
  }

  /**
   * Get all indexed document URIs.
   */
  getDocumentUris(): string[] {
    return [...this.documents.keys()];
  }

  /**
   * Get all globals across the workspace.
   */
  getAllGlobals(): IndexedGlobal[] {
    return [...this.globalsByName.values()];
  }

  /**
   * Get all declared types across the workspace.
   */
  getAllDeclaredTypes(): IndexedType[] {
    return [...this.declaredTypes.values()];
  }

  /**
   * Get all queries across the workspace.
   */
  getAllQueries(): IndexedQuery[] {
    return [...this.querysByName.values()];
  }

  /**
   * Get all functions across the workspace.
   */
  getAllFunctions(): IndexedFunction[] {
    return [...this.functionsByName.values()];
  }

  /**
   * Total number of indexed documents.
   */
  get documentCount(): number {
    return this.documents.size;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private indexDocument(uri: string, doc: DrlDocument): void {
    // Index rules
    for (const rule of doc.ast.rules) {
      const entries = this.rulesByName.get(rule.name) || [];
      entries.push({ uri, rule });
      this.rulesByName.set(rule.name, entries);
    }

    // Index declared types
    for (const decl of doc.ast.declares) {
      this.declaredTypes.set(decl.name, { uri, decl });
    }

    // Index imports
    for (const imp of doc.ast.imports) {
      if (!imp.target) continue;
      const uris = this.importedTypes.get(imp.target) || new Set();
      uris.add(uri);
      this.importedTypes.set(imp.target, uris);
    }

    // Index globals
    for (const g of doc.ast.globals) {
      this.globalsByName.set(g.name, { uri, global: g });
    }

    // Index queries
    for (const q of doc.ast.queries) {
      this.querysByName.set(q.name, { uri, query: q });
    }

    // Index functions
    for (const f of doc.ast.functions) {
      this.functionsByName.set(f.name, { uri, func: f });
    }
  }

  private clearIndexes(): void {
    this.documents.clear();
    this.rulesByName.clear();
    this.declaredTypes.clear();
    this.importedTypes.clear();
    this.globalsByName.clear();
    this.querysByName.clear();
    this.functionsByName.clear();
  }
}

// ── Utility functions ─────────────────────────────────────────────────

/**
 * Check if a rule references a fact type in any of its LHS conditions.
 */
function ruleUsesFactType(rule: AST.RuleDeclaration, typeName: string): boolean {
  return rule.lhs.conditions.some((c) => conditionUsesFactType(c, typeName));
}

function conditionUsesFactType(condition: AST.Condition, typeName: string): boolean {
  switch (condition.kind) {
    case "PatternCondition":
      return condition.factType === typeName;
    case "NotCondition":
      return conditionUsesFactType(condition.condition, typeName);
    case "ExistsCondition":
      return conditionUsesFactType(condition.condition, typeName);
    case "AndCondition":
      return (
        conditionUsesFactType(condition.left, typeName) ||
        conditionUsesFactType(condition.right, typeName)
      );
    case "OrCondition":
      return (
        conditionUsesFactType(condition.left, typeName) ||
        conditionUsesFactType(condition.right, typeName)
      );
    case "ForallCondition":
      return condition.conditions.some((c) => conditionUsesFactType(c, typeName));
    case "FromCondition":
      return conditionUsesFactType(condition.pattern, typeName);
    case "AccumulateCondition":
      return conditionUsesFactType(condition.source, typeName);
    default:
      return false;
  }
}
