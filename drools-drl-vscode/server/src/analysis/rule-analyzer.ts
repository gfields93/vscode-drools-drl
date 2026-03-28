/**
 * Rule Analysis Engine.
 *
 * Performs static analysis of rule interactions to detect:
 * - Conflicts: overlapping LHS conditions with contradictory RHS actions
 * - Redundancy: rules shadowed by higher-salience rules with broader conditions
 * - Circular dependencies: insert/modify chains that could cause infinite loops
 */

import * as AST from "../parser/ast";
import { DrlIndex, IndexedRule } from "../workspace/drl-index";

// ── Result types ──────────────────────────────────────────────────────

export interface RuleConflict {
  ruleA: { name: string; uri: string };
  ruleB: { name: string; uri: string };
  factType: string;
  field: string;
  valueA: string;
  valueB: string;
  reason: string;
}

export interface RuleShadow {
  shadowed: { name: string; uri: string; salience: number };
  shadowedBy: { name: string; uri: string; salience: number };
  factType: string;
  reason: string;
}

export interface CircularDependency {
  cycle: { name: string; uri: string }[];
  reason: string;
}

export interface RuleDependency {
  ruleName: string;
  uri: string;
  triggers: string[];    // Fact types this rule inserts/modifies
  triggeredBy: string[]; // Fact types this rule matches on
}

export interface AnalysisResult {
  conflicts: RuleConflict[];
  shadows: RuleShadow[];
  circularDependencies: CircularDependency[];
  dependencies: RuleDependency[];
}

// ── Main analysis function ────────────────────────────────────────────

/**
 * Run full rule analysis across the workspace index.
 */
export function analyzeRules(
  drlIndex: DrlIndex,
  maxRules: number = 500
): AnalysisResult {
  const allRules = collectAllRules(drlIndex);

  // Cap analysis to avoid performance issues on large rule sets
  const rules = allRules.slice(0, maxRules);

  const dependencies = buildDependencyGraph(rules);
  const conflicts = detectConflicts(rules);
  const shadows = detectShadowing(rules);
  const circularDependencies = detectCircularDependencies(dependencies);

  return { conflicts, shadows, circularDependencies, dependencies };
}

/**
 * Get dependency info for a single rule.
 */
export function getRuleDependencies(
  ruleName: string,
  drlIndex: DrlIndex
): RuleDependency | undefined {
  const indexed = drlIndex.findRule(ruleName);
  if (!indexed) return undefined;
  return buildSingleRuleDependency(indexed);
}

// ── Conflict Detection ────────────────────────────────────────────────

function detectConflicts(rules: IndexedRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const ruleA = rules[i];
      const ruleB = rules[j];

      // Only compare rules in the same file — cross-file conflicts
      // are too noisy without package/agenda-group scoping
      if (ruleA.uri !== ruleB.uri) continue;

      // Extract pattern info from both rules
      const patternsA = extractPatterns(ruleA.rule.lhs.conditions);
      const patternsB = extractPatterns(ruleB.rule.lhs.conditions);

      // Find shared fact types
      for (const pA of patternsA) {
        for (const pB of patternsB) {
          if (pA.factType !== pB.factType) continue;

          // Check for overlapping constraints with contradictory modifications
          const modA = extractModifications(ruleA.rule.rhs, pA.factType);
          const modB = extractModifications(ruleB.rule.rhs, pB.factType);

          for (const mA of modA) {
            for (const mB of modB) {
              if (mA.field === mB.field && mA.value !== mB.value) {
                // Check if constraints overlap
                const overlap = checkConstraintOverlap(pA.constraints, pB.constraints);
                if (overlap) {
                  conflicts.push({
                    ruleA: { name: ruleA.rule.name, uri: ruleA.uri },
                    ruleB: { name: ruleB.rule.name, uri: ruleB.uri },
                    factType: pA.factType,
                    field: mA.field,
                    valueA: mA.value,
                    valueB: mB.value,
                    reason:
                      `Both rules match \`${pA.factType}\` and modify \`${mA.field}\` ` +
                      `to different values ("${mA.value}" vs "${mB.value}")`,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return conflicts;
}

// ── Shadowing Detection ───────────────────────────────────────────────

function detectShadowing(rules: IndexedRule[]): RuleShadow[] {
  const shadows: RuleShadow[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const ruleA = rules[i];
      const ruleB = rules[j];

      const salienceA = getSalience(ruleA.rule);
      const salienceB = getSalience(ruleB.rule);

      // Only check if they're in the same agenda group
      const groupA = getAgendaGroup(ruleA.rule);
      const groupB = getAgendaGroup(ruleB.rule);
      if (groupA !== groupB) continue;

      const patternsA = extractPatterns(ruleA.rule.lhs.conditions);
      const patternsB = extractPatterns(ruleB.rule.lhs.conditions);

      // Check if one rule's conditions are a subset of the other's
      const sharedTypes = findSharedFactTypes(patternsA, patternsB);
      if (sharedTypes.length === 0) continue;

      // If same conditions and different salience, higher salience shadows lower
      if (salienceA !== salienceB && patternsA.length === patternsB.length) {
        const conditionsMatch = sharedTypes.length === patternsA.length &&
          sharedTypes.length === patternsB.length &&
          patternsMatchConstraints(patternsA, patternsB);

        if (conditionsMatch) {
          const [higher, lower] = salienceA > salienceB
            ? [ruleA, ruleB]
            : [ruleB, ruleA];
          const [higherSal, lowerSal] = salienceA > salienceB
            ? [salienceA, salienceB]
            : [salienceB, salienceA];

          shadows.push({
            shadowed: { name: lower.rule.name, uri: lower.uri, salience: lowerSal },
            shadowedBy: { name: higher.rule.name, uri: higher.uri, salience: higherSal },
            factType: sharedTypes[0],
            reason:
              `Rule "${higher.rule.name}" (salience ${higherSal}) may always fire ` +
              `before "${lower.rule.name}" (salience ${lowerSal}) with overlapping conditions`,
          });
        }
      }
    }
  }

  return shadows;
}

// ── Circular Dependency Detection ─────────────────────────────────────

function detectCircularDependencies(
  dependencies: RuleDependency[]
): CircularDependency[] {
  const cycles: CircularDependency[] = [];

  // Build adjacency map: rule -> rules it can trigger
  // A rule triggers another if its RHS inserts/modifies a type that
  // the other rule matches on in its LHS
  const triggerMap = new Map<string, { name: string; uri: string }[]>();

  for (const depA of dependencies) {
    const triggered: { name: string; uri: string }[] = [];

    for (const insertedType of depA.triggers) {
      for (const depB of dependencies) {
        if (depA.ruleName === depB.ruleName) continue;
        if (depB.triggeredBy.includes(insertedType)) {
          triggered.push({ name: depB.ruleName, uri: depB.uri });
        }
      }
    }

    triggerMap.set(depA.ruleName, triggered);
  }

  // DFS to find cycles
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: { name: string; uri: string }[] = [];

  function dfs(ruleName: string): void {
    if (inStack.has(ruleName)) {
      // Found a cycle — extract it from the path
      const cycleStart = path.findIndex((p) => p.name === ruleName);
      if (cycleStart >= 0) {
        const cycle = [...path.slice(cycleStart), path[cycleStart]]; // close the loop
        const cycleNames = cycle.map((c) => c.name).join(" → ");
        cycles.push({
          cycle,
          reason: `Circular dependency: ${cycleNames}`,
        });
      }
      return;
    }

    if (visited.has(ruleName)) return;

    visited.add(ruleName);
    inStack.add(ruleName);

    const dep = dependencies.find((d) => d.ruleName === ruleName);
    if (dep) {
      path.push({ name: dep.ruleName, uri: dep.uri });
    }

    const triggered = triggerMap.get(ruleName) || [];
    for (const next of triggered) {
      dfs(next.name);
    }

    path.pop();
    inStack.delete(ruleName);
  }

  for (const dep of dependencies) {
    visited.clear();
    inStack.clear();
    path.length = 0;
    dfs(dep.ruleName);
  }

  // Deduplicate cycles (same cycle can be found starting from different nodes)
  return deduplicateCycles(cycles);
}

// ── Dependency Graph ──────────────────────────────────────────────────

function buildDependencyGraph(rules: IndexedRule[]): RuleDependency[] {
  return rules.map(buildSingleRuleDependency);
}

function buildSingleRuleDependency(indexed: IndexedRule): RuleDependency {
  const rule = indexed.rule;

  // What fact types does this rule match on?
  const triggeredBy = extractPatterns(rule.lhs.conditions).map((p) => p.factType);

  // What fact types does this rule insert into working memory?
  // Only insert/insertLogical create new facts that trigger other rules.
  // modify/update change existing facts in-place and don't create new
  // activations for circular dependency purposes.
  const triggers: string[] = [];

  // Also scan rawText for insert( new TypeName(...) )
  const insertPattern = /\binsert(?:Logical)?\s*\(\s*new\s+(\w+)/g;
  let match;
  while ((match = insertPattern.exec(rule.rhs.rawText)) !== null) {
    if (!triggers.includes(match[1])) {
      triggers.push(match[1]);
    }
  }

  return {
    ruleName: rule.name,
    uri: indexed.uri,
    triggers: [...new Set(triggers)],
    triggeredBy: [...new Set(triggeredBy)],
  };
}

// ── Pattern & Constraint Extraction ───────────────────────────────────

interface PatternInfo {
  factType: string;
  constraints: string;
  binding?: string;
}

function extractPatterns(conditions: AST.Condition[]): PatternInfo[] {
  const patterns: PatternInfo[] = [];
  for (const cond of conditions) {
    collectPatterns(cond, patterns);
  }
  return patterns;
}

function collectPatterns(cond: AST.Condition, patterns: PatternInfo[]): void {
  switch (cond.kind) {
    case "PatternCondition":
      patterns.push({
        factType: cond.factType,
        constraints: cond.constraints,
        binding: cond.binding?.name,
      });
      break;
    case "NotCondition":
      collectPatterns(cond.condition, patterns);
      break;
    case "ExistsCondition":
      collectPatterns(cond.condition, patterns);
      break;
    case "AndCondition":
      collectPatterns(cond.left, patterns);
      collectPatterns(cond.right, patterns);
      break;
    case "OrCondition":
      collectPatterns(cond.left, patterns);
      collectPatterns(cond.right, patterns);
      break;
    case "ForallCondition":
      for (const c of cond.conditions) collectPatterns(c, patterns);
      break;
    case "FromCondition":
      collectPatterns(cond.pattern, patterns);
      break;
    case "AccumulateCondition":
      collectPatterns(cond.source, patterns);
      break;
  }
}

interface Modification {
  field: string;
  value: string;
}

/**
 * Extract field modifications from the RHS for a given fact type.
 * Looks for patterns like: modify($binding) { setField(value) }
 */
function extractModifications(rhs: AST.RHSBlock, factType: string): Modification[] {
  const mods: Modification[] = [];
  const rawText = rhs.rawText;
  if (!rawText) return mods;

  // Match: setFieldName( "value" ) or setFieldName( value )
  const setterPattern = /\bset(\w+)\s*\(\s*(?:"([^"]+)"|(\w+))\s*\)/g;
  let match;
  while ((match = setterPattern.exec(rawText)) !== null) {
    const field = match[1].charAt(0).toLowerCase() + match[1].slice(1);
    const value = match[2] || match[3];
    mods.push({ field, value });
  }

  return mods;
}

/**
 * Check if two constraint strings have potentially overlapping conditions.
 * Uses conservative heuristics — returns true if overlap is possible.
 */
function checkConstraintOverlap(constraintsA: string, constraintsB: string): boolean {
  if (!constraintsA && !constraintsB) return true; // Both unconstrained
  if (!constraintsA || !constraintsB) return true;  // One unconstrained — always overlaps

  // Extract field comparisons from both constraints
  const compsA = extractComparisons(constraintsA);
  const compsB = extractComparisons(constraintsB);

  // Check for overlapping ranges on the same field
  for (const cA of compsA) {
    for (const cB of compsB) {
      if (cA.field !== cB.field) continue;

      // Same field with same operator and value = identical (overlap)
      if (cA.operator === cB.operator && cA.value === cB.value) return true;

      // Numeric range overlap check
      const numA = parseFloat(cA.value);
      const numB = parseFloat(cB.value);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (rangesOverlap(cA.operator, numA, cB.operator, numB)) return true;
      }

      // Same field, different equality values = no overlap
      if (cA.operator === "==" && cB.operator === "==" && cA.value !== cB.value) {
        return false;
      }
    }
  }

  // Conservative: if we can't prove disjointness, assume overlap
  return true;
}

interface Comparison {
  field: string;
  operator: string;
  value: string;
}

function extractComparisons(constraints: string): Comparison[] {
  const comps: Comparison[] = [];
  const pattern = /(\w+)\s*(==|!=|>=?|<=?)\s*(?:"([^"]+)"|(\d+(?:\.\d+)?)|(true|false|null))/g;
  let match;
  while ((match = pattern.exec(constraints)) !== null) {
    comps.push({
      field: match[1],
      operator: match[2],
      value: match[3] || match[4] || match[5],
    });
  }
  return comps;
}

/**
 * Check if two numeric ranges overlap.
 * E.g. (> 18) and (> 21) overlap (everything > 21 satisfies both).
 */
function rangesOverlap(
  opA: string, valA: number,
  opB: string, valB: number
): boolean {
  // Build intervals from each comparison
  const [minA, maxA] = operatorToRange(opA, valA);
  const [minB, maxB] = operatorToRange(opB, valB);

  // Intervals overlap if min of one < max of other
  return minA < maxB && minB < maxA;
}

function operatorToRange(op: string, val: number): [number, number] {
  switch (op) {
    case ">": return [val, Infinity];
    case ">=": return [val, Infinity];
    case "<": return [-Infinity, val];
    case "<=": return [-Infinity, val];
    case "==": return [val, val + 0.0001]; // Point interval
    case "!=": return [-Infinity, Infinity]; // Everything except one point
    default: return [-Infinity, Infinity];
  }
}

// ── Utility helpers ───────────────────────────────────────────────────

function collectAllRules(drlIndex: DrlIndex): IndexedRule[] {
  const rules: IndexedRule[] = [];
  for (const uri of drlIndex.getDocumentUris()) {
    const doc = drlIndex.getDocument(uri);
    if (!doc) continue;
    for (const rule of doc.ast.rules) {
      rules.push({ uri, rule });
    }
  }
  return rules;
}

function getSalience(rule: AST.RuleDeclaration): number {
  const attr = rule.attributes.find((a) => a.name === "salience");
  return attr ? Number(attr.value) || 0 : 0;
}

function getAgendaGroup(rule: AST.RuleDeclaration): string {
  const attr = rule.attributes.find((a) => a.name === "agenda-group");
  return attr ? String(attr.value) : "";
}

function findBindingType(
  bindingName: string,
  rule: AST.RuleDeclaration
): string | undefined {
  for (const cond of rule.lhs.conditions) {
    const type = findBindingTypeInCondition(cond, bindingName);
    if (type) return type;
  }
  return undefined;
}

function findBindingTypeInCondition(
  cond: AST.Condition,
  bindingName: string
): string | undefined {
  switch (cond.kind) {
    case "PatternCondition":
      if (cond.binding?.name === bindingName) return cond.factType;
      return undefined;
    case "NotCondition":
      return findBindingTypeInCondition(cond.condition, bindingName);
    case "ExistsCondition":
      return findBindingTypeInCondition(cond.condition, bindingName);
    case "AndCondition":
      return findBindingTypeInCondition(cond.left, bindingName) ||
        findBindingTypeInCondition(cond.right, bindingName);
    case "OrCondition":
      return findBindingTypeInCondition(cond.left, bindingName) ||
        findBindingTypeInCondition(cond.right, bindingName);
    case "ForallCondition":
      for (const c of cond.conditions) {
        const t = findBindingTypeInCondition(c, bindingName);
        if (t) return t;
      }
      return undefined;
    case "FromCondition":
      return findBindingTypeInCondition(cond.pattern, bindingName);
    default:
      return undefined;
  }
}

/**
 * Check if two sets of patterns have matching constraints (same fact types
 * with identical or very similar constraint text).
 */
function patternsMatchConstraints(a: PatternInfo[], b: PatternInfo[]): boolean {
  for (const pA of a) {
    const matching = b.find((pB) => pB.factType === pA.factType);
    if (!matching) return false;
    // Normalize whitespace for comparison
    const normA = (pA.constraints || "").replace(/\s+/g, " ").trim();
    const normB = (matching.constraints || "").replace(/\s+/g, " ").trim();
    if (normA !== normB) return false;
  }
  return true;
}

function findSharedFactTypes(a: PatternInfo[], b: PatternInfo[]): string[] {
  const typesA = new Set(a.map((p) => p.factType));
  return b.map((p) => p.factType).filter((t) => typesA.has(t));
}

function deduplicateCycles(cycles: CircularDependency[]): CircularDependency[] {
  const seen = new Set<string>();
  return cycles.filter((c) => {
    // Normalize by sorting the cycle members (without the closing node)
    const members = c.cycle.slice(0, -1).map((n) => n.name).sort().join(",");
    if (seen.has(members)) return false;
    seen.add(members);
    return true;
  });
}
