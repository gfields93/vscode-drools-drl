/**
 * AST node types for Drools Rule Language files.
 *
 * Every node carries a `range` for LSP position mapping.
 */

export interface Range {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

// =====================================================================
// Root
// =====================================================================

export interface DrlFile {
  kind: "DrlFile";
  packageDecl?: PackageDeclaration;
  imports: ImportDeclaration[];
  globals: GlobalDeclaration[];
  declares: TypeDeclaration[];
  functions: FunctionDeclaration[];
  queries: QueryDeclaration[];
  rules: RuleDeclaration[];
  errors: ParseError[];
  range: Range;
}

// =====================================================================
// Top-level declarations
// =====================================================================

export interface PackageDeclaration {
  kind: "PackageDeclaration";
  name: string;
  range: Range;
}

export interface ImportDeclaration {
  kind: "ImportDeclaration";
  isFunction: boolean;
  isStatic: boolean;
  target: string;
  range: Range;
}

export interface GlobalDeclaration {
  kind: "GlobalDeclaration";
  type: string;
  name: string;
  range: Range;
}

// =====================================================================
// Type declarations
// =====================================================================

export interface TypeDeclaration {
  kind: "TypeDeclaration";
  name: string;
  superType?: string;
  isTrait: boolean;
  fields: FieldDeclaration[];
  metadata: MetadataAnnotation[];
  range: Range;
  nameRange: Range;
}

export interface FieldDeclaration {
  kind: "FieldDeclaration";
  name: string;
  type: string;
  defaultValue?: string;
  metadata: MetadataAnnotation[];
  range: Range;
}

export interface MetadataAnnotation {
  kind: "MetadataAnnotation";
  key: string;
  value?: string;
  range: Range;
}

// =====================================================================
// Rules
// =====================================================================

export interface RuleDeclaration {
  kind: "RuleDeclaration";
  name: string;
  parentRule?: string;
  attributes: RuleAttribute[];
  lhs: LHSBlock;
  rhs: RHSBlock;
  range: Range;
  nameRange: Range;
}

export interface RuleAttribute {
  kind: "RuleAttribute";
  name: string;
  value: string | number | boolean;
  range: Range;
}

// =====================================================================
// LHS (When block)
// =====================================================================

export interface LHSBlock {
  kind: "LHSBlock";
  conditions: Condition[];
  range: Range;
}

export type Condition =
  | PatternCondition
  | NotCondition
  | ExistsCondition
  | AndCondition
  | OrCondition
  | EvalCondition
  | ForallCondition
  | AccumulateCondition
  | FromCondition;

export interface PatternCondition {
  kind: "PatternCondition";
  binding?: BindingVariable;
  factType: string;
  constraints: string;
  range: Range;
  factTypeRange: Range;
}

export interface BindingVariable {
  kind: "BindingVariable";
  name: string;
  range: Range;
}

export interface NotCondition {
  kind: "NotCondition";
  condition: Condition;
  range: Range;
}

export interface ExistsCondition {
  kind: "ExistsCondition";
  condition: Condition;
  range: Range;
}

export interface AndCondition {
  kind: "AndCondition";
  left: Condition;
  right: Condition;
  range: Range;
}

export interface OrCondition {
  kind: "OrCondition";
  left: Condition;
  right: Condition;
  range: Range;
}

export interface EvalCondition {
  kind: "EvalCondition";
  expression: string;
  range: Range;
}

export interface ForallCondition {
  kind: "ForallCondition";
  conditions: Condition[];
  range: Range;
}

export interface AccumulateCondition {
  kind: "AccumulateCondition";
  source: Condition;
  functions: string;
  range: Range;
}

export interface FromCondition {
  kind: "FromCondition";
  pattern: PatternCondition;
  expression: string;
  range: Range;
}

// =====================================================================
// RHS (Then block)
// =====================================================================

export interface RHSBlock {
  kind: "RHSBlock";
  actions: RHSAction[];
  rawText: string;
  range: Range;
}

export interface RHSAction {
  kind: "RHSAction";
  type: "insert" | "insertLogical" | "update" | "modify" | "delete" | "retract" | "other";
  targetBinding?: string;
  range: Range;
}

// =====================================================================
// Queries and Functions
// =====================================================================

export interface QueryDeclaration {
  kind: "QueryDeclaration";
  name: string;
  parameters: ParameterDeclaration[];
  conditions: Condition[];
  range: Range;
  nameRange: Range;
}

export interface FunctionDeclaration {
  kind: "FunctionDeclaration";
  returnType: string;
  name: string;
  parameters: ParameterDeclaration[];
  body: string;
  range: Range;
  nameRange: Range;
}

export interface ParameterDeclaration {
  kind: "ParameterDeclaration";
  type: string;
  name: string;
  range: Range;
}

// =====================================================================
// Errors
// =====================================================================

export interface ParseError {
  message: string;
  range: Range;
  severity: "error" | "warning" | "info";
  code?: string;
}
