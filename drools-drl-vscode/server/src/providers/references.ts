/**
 * Find References provider for DRL files.
 *
 * Supports finding all references to:
 * - Rule names (extends references, agenda-group co-members)
 * - Declared type names (LHS patterns, imports)
 * - Global variable names (all rules referencing the global)
 * - Fact types from Java (all DRL files/rules using the type)
 * - Binding variables (all references within the same rule)
 * - Query names (all references across workspace)
 * - Function names (all references across workspace)
 */

import {
  Location,
  Position,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "../model/drl-document";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { toLspRange } from "../utils/position";
import * as AST from "../parser/ast";

/**
 * Find all references to the symbol at the given position.
 */
export function getReferences(
  textDoc: TextDocument,
  pos: Position,
  doc: DrlDocument,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const word = getWordAtPosition(textDoc, pos);
  if (!word) return [];

  // 1. Binding variable references (within the same rule)
  if (word.startsWith("$")) {
    return findBindingReferences(word, pos, doc, includeDeclaration);
  }

  // 2. Rule name references
  const ruleRefs = findRuleNameReferences(word, workspaceIndex, includeDeclaration);
  if (ruleRefs.length > 0) return ruleRefs;

  // 3. Declared type references
  const typeRefs = findDeclaredTypeReferences(word, workspaceIndex, includeDeclaration);
  if (typeRefs.length > 0) return typeRefs;

  // 4. Global variable references
  const globalRefs = findGlobalReferences(word, workspaceIndex, includeDeclaration);
  if (globalRefs.length > 0) return globalRefs;

  // 5. Query name references
  const queryRefs = findQueryReferences(word, workspaceIndex, includeDeclaration);
  if (queryRefs.length > 0) return queryRefs;

  // 6. Function name references
  const funcRefs = findFunctionReferences(word, workspaceIndex, includeDeclaration);
  if (funcRefs.length > 0) return funcRefs;

  // 7. Fact type (Java or DRL) references across all DRL files
  const factTypeRefs = findFactTypeReferences(word, workspaceIndex, includeDeclaration);
  if (factTypeRefs.length > 0) return factTypeRefs;

  return [];
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Find all references to a binding variable within its rule.
 */
function findBindingReferences(
  bindingName: string,
  pos: Position,
  doc: DrlDocument,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];
  const rule = doc.findRuleAt(pos);
  if (!rule) return locations;

  // Find the declaration in LHS
  const bindings = doc.getBindingsInRule(rule);
  const binding = bindings.find((b) => b.name === bindingName);

  if (binding && includeDeclaration) {
    locations.push(Location.create(doc.uri, toLspRange(binding.range)));
  }

  // Find usages in RHS actions
  for (const action of rule.rhs.actions) {
    if (action.targetBinding === bindingName) {
      locations.push(Location.create(doc.uri, toLspRange(action.range)));
    }
  }

  // Scan RHS raw text for additional references
  const rhsText = rule.rhs.rawText;
  if (rhsText) {
    const rhsRange = rule.rhs.range;
    const lines = rhsText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let searchFrom = 0;
      while (true) {
        const idx = lines[i].indexOf(bindingName, searchFrom);
        if (idx === -1) break;
        // Check it's a whole word match
        const before = idx > 0 ? lines[i][idx - 1] : " ";
        const after = idx + bindingName.length < lines[i].length
          ? lines[i][idx + bindingName.length]
          : " ";
        if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) {
          const line = rhsRange.startLine + i + 1; // +1 to skip the 'then' line
          locations.push(
            Location.create(
              doc.uri,
              Range.create(line, idx, line, idx + bindingName.length)
            )
          );
        }
        searchFrom = idx + bindingName.length;
      }
    }
  }

  // Deduplicate by range
  return deduplicateLocations(locations);
}

/**
 * Find all references to a rule name across the workspace.
 */
function findRuleNameReferences(
  ruleName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];
  const indexed = workspaceIndex.drlIndex.findAllRulesNamed(ruleName);

  if (indexed.length === 0) return locations;

  // Include declaration(s)
  if (includeDeclaration) {
    for (const entry of indexed) {
      locations.push(Location.create(entry.uri, toLspRange(entry.rule.nameRange)));
    }
  }

  // Find extends references across all documents
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      if (rule.parentRule === ruleName) {
        // The extends reference — find the parent rule name position
        // It's within the rule's range but before the 'when' keyword
        locations.push(Location.create(uri, toLspRange(rule.nameRange)));
      }
    }
  }

  return deduplicateLocations(locations);
}

/**
 * Find all references to a declared type across the workspace.
 */
function findDeclaredTypeReferences(
  typeName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];

  // Find declaration
  const decl = workspaceIndex.drlIndex.findDeclaredType(typeName);
  if (!decl) return locations;

  if (includeDeclaration) {
    locations.push(Location.create(decl.uri, toLspRange(decl.decl.nameRange)));
  }

  // Find pattern references across all documents
  const rulesUsingType = workspaceIndex.drlIndex.findAllRulesUsingFactType(typeName);
  for (const entry of rulesUsingType) {
    addPatternTypeLocations(entry.rule.lhs.conditions, typeName, entry.uri, locations);
  }

  // Find import references
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const imp of doc.ast.imports) {
      if (imp.target.endsWith("." + typeName)) {
        locations.push(Location.create(uri, toLspRange(imp.range)));
      }
    }
  }

  return deduplicateLocations(locations);
}

/**
 * Find all references to a global variable across the workspace.
 */
function findGlobalReferences(
  globalName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];
  const allGlobals = workspaceIndex.drlIndex.getAllGlobals();
  const globalDecl = allGlobals.find((g) => g.global.name === globalName);

  if (!globalDecl) return locations;

  if (includeDeclaration) {
    locations.push(Location.create(globalDecl.uri, toLspRange(globalDecl.global.range)));
  }

  // Scan all rules for references to this global in RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      if (rule.rhs.rawText.includes(globalName)) {
        locations.push(Location.create(uri, toLspRange(rule.rhs.range)));
      }
    }
  }

  return deduplicateLocations(locations);
}

/**
 * Find all references to a query across the workspace.
 */
function findQueryReferences(
  queryName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];
  const allQueries = workspaceIndex.drlIndex.getAllQueries();
  const queryDecl = allQueries.find((q) => q.query.name === queryName);

  if (!queryDecl) return locations;

  if (includeDeclaration) {
    locations.push(Location.create(queryDecl.uri, toLspRange(queryDecl.query.nameRange)));
  }

  // Scan all rules for references to this query in RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      if (rule.rhs.rawText.includes(queryName)) {
        locations.push(Location.create(uri, toLspRange(rule.rhs.range)));
      }
    }
  }

  return deduplicateLocations(locations);
}

/**
 * Find all references to a function across the workspace.
 */
function findFunctionReferences(
  funcName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];
  const allFunctions = workspaceIndex.drlIndex.getAllFunctions();
  const funcDecl = allFunctions.find((f) => f.func.name === funcName);

  if (!funcDecl) return locations;

  if (includeDeclaration) {
    locations.push(Location.create(funcDecl.uri, toLspRange(funcDecl.func.nameRange)));
  }

  // Scan all rules for references to this function in RHS
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const rule of doc.ast.rules) {
      if (rule.rhs.rawText.includes(funcName)) {
        locations.push(Location.create(uri, toLspRange(rule.rhs.range)));
      }
    }
  }

  return deduplicateLocations(locations);
}

/**
 * Find all references to a fact type (Java or DRL) across all DRL files.
 */
function findFactTypeReferences(
  typeName: string,
  workspaceIndex: WorkspaceIndex,
  includeDeclaration: boolean
): Location[] {
  const locations: Location[] = [];

  // Check if this is a known fact type
  const rulesUsingType = workspaceIndex.drlIndex.findAllRulesUsingFactType(typeName);
  if (rulesUsingType.length === 0) return locations;

  for (const entry of rulesUsingType) {
    addPatternTypeLocations(entry.rule.lhs.conditions, typeName, entry.uri, locations);
  }

  // Find import references
  for (const uri of workspaceIndex.drlIndex.getDocumentUris()) {
    const doc = workspaceIndex.drlIndex.getDocument(uri);
    if (!doc) continue;

    for (const imp of doc.ast.imports) {
      if (imp.target.endsWith("." + typeName)) {
        locations.push(Location.create(uri, toLspRange(imp.range)));
      }
    }
  }

  return deduplicateLocations(locations);
}

// ── Utility functions ─────────────────────────────────────────────────

/**
 * Add locations for pattern conditions that reference a given fact type.
 */
function addPatternTypeLocations(
  conditions: AST.Condition[],
  typeName: string,
  uri: string,
  locations: Location[]
): void {
  for (const cond of conditions) {
    addPatternTypeFromCondition(cond, typeName, uri, locations);
  }
}

function addPatternTypeFromCondition(
  cond: AST.Condition,
  typeName: string,
  uri: string,
  locations: Location[]
): void {
  switch (cond.kind) {
    case "PatternCondition":
      if (cond.factType === typeName) {
        locations.push(Location.create(uri, toLspRange(cond.factTypeRange)));
      }
      break;
    case "NotCondition":
      addPatternTypeFromCondition(cond.condition, typeName, uri, locations);
      break;
    case "ExistsCondition":
      addPatternTypeFromCondition(cond.condition, typeName, uri, locations);
      break;
    case "AndCondition":
      addPatternTypeFromCondition(cond.left, typeName, uri, locations);
      addPatternTypeFromCondition(cond.right, typeName, uri, locations);
      break;
    case "OrCondition":
      addPatternTypeFromCondition(cond.left, typeName, uri, locations);
      addPatternTypeFromCondition(cond.right, typeName, uri, locations);
      break;
    case "ForallCondition":
      for (const c of cond.conditions) {
        addPatternTypeFromCondition(c, typeName, uri, locations);
      }
      break;
    case "FromCondition":
      addPatternTypeFromCondition(cond.pattern, typeName, uri, locations);
      break;
    case "AccumulateCondition":
      addPatternTypeFromCondition(cond.source, typeName, uri, locations);
      break;
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

function deduplicateLocations(locations: Location[]): Location[] {
  const seen = new Set<string>();
  return locations.filter((loc) => {
    const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
