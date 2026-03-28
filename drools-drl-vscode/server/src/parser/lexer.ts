import { createToken, Lexer, ITokenConfig, TokenType } from "chevrotain";

// ---------------------------------------------------------------------
// Utility: create a keyword token that only matches as a whole word
// ---------------------------------------------------------------------
function kw(name: string, pattern: string | RegExp, config?: Partial<ITokenConfig>): TokenType {
  const pat = typeof pattern === "string" ? new RegExp(`\\b${pattern}\\b`) : pattern;
  return createToken({ name, pattern: pat, ...config });
}

// =====================================================================
// Token Definitions
// =====================================================================

// -- Whitespace & Comments (skipped) ----------------------------------
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t\r\n]+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/[^\n\r]*|#[^\n\r]*/,
  group: "comments",
});

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: "comments",
});

// -- String & Numeric Literals ----------------------------------------
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"(?:[^"\\]|\\.)*"/,
});

export const FloatLiteral = createToken({
  name: "FloatLiteral",
  pattern: /\d+\.\d+[fFdD]?/,
});

export const IntegerLiteral = createToken({
  name: "IntegerLiteral",
  pattern: /\d+[lL]?/,
});

// -- Boolean & Null ---------------------------------------------------
export const True = kw("True", "true");
export const False = kw("False", "false");
export const Null = kw("Null", "null");

// -- Hard Keywords (reserved) -----------------------------------------
export const Package = kw("Package", "package");
export const Import = kw("Import", "import");
export const Function = kw("Function", "function");
export const Global = kw("Global", "global");
export const Rule = kw("Rule", "rule");
export const Query = kw("Query", "query");
export const End = kw("End", "end");

// -- Structural Keywords ----------------------------------------------
export const When = kw("When", "when");
export const Then = kw("Then", "then");
export const Declare = kw("Declare", "declare");
export const Extends = kw("Extends", "extends");
export const Unit = kw("Unit", "unit");
export const Trait = kw("Trait", "trait");

// -- Rule Attribute Keywords ------------------------------------------
export const Salience = kw("Salience", "salience");
export const NoLoop = kw("NoLoop", /\bno-loop\b/);
export const LockOnActive = kw("LockOnActive", /\block-on-active\b/);
export const DateEffective = kw("DateEffective", /\bdate-effective\b/);
export const DateExpires = kw("DateExpires", /\bdate-expires\b/);
export const Enabled = kw("Enabled", "enabled");
export const Duration = kw("Duration", "duration");
export const Timer = kw("Timer", "timer");
export const Calendars = kw("Calendars", "calendars");
export const Dialect = kw("Dialect", "dialect");
export const ActivationGroup = kw("ActivationGroup", /\bactivation-group\b/);
export const AgendaGroup = kw("AgendaGroup", /\bagenda-group\b/);
export const RuleflowGroup = kw("RuleflowGroup", /\bruleflow-group\b/);
export const AutoFocus = kw("AutoFocus", /\bauto-focus\b/);

// -- LHS Condition Keywords -------------------------------------------
export const Not = kw("Not", "not");
export const Exists = kw("Exists", "exists");
export const And = kw("And", "and");
export const Or = kw("Or", "or");
export const In = kw("In", "in");
export const From = kw("From", "from");
export const Collect = kw("Collect", "collect");
export const Accumulate = kw("Accumulate", "accumulate");
export const Forall = kw("Forall", "forall");
export const Eval = kw("Eval", "eval");
export const Over = kw("Over", "over");
export const Window = kw("Window", "window");
export const EntryPoint = kw("EntryPoint", /\bentry-point\b/);

// -- RHS Action Keywords ----------------------------------------------
export const Insert = kw("Insert", "insert");
export const InsertLogical = kw("InsertLogical", "insertLogical");
export const Update = kw("Update", "update");
export const Modify = kw("Modify", "modify");
export const Delete = kw("Delete", "delete");
export const Retract = kw("Retract", "retract");

// -- Special LHS Operators --------------------------------------------
export const Matches = kw("Matches", "matches");
export const MemberOf = kw("MemberOf", "memberOf");
export const Contains = kw("Contains", "contains");
export const Soundslike = kw("Soundslike", "soundslike");
export const Str = kw("Str", "str");

// -- Comparison & Logical Operators -----------------------------------
export const EqualsEquals = createToken({ name: "EqualsEquals", pattern: /==/ });
export const NotEquals = createToken({ name: "NotEquals", pattern: /!=/ });
export const GreaterEquals = createToken({ name: "GreaterEquals", pattern: />=/ });
export const LessEquals = createToken({ name: "LessEquals", pattern: /<=/ });
export const GreaterThan = createToken({ name: "GreaterThan", pattern: />/ });
export const LessThan = createToken({ name: "LessThan", pattern: /</ });
export const LogicalAnd = createToken({ name: "LogicalAnd", pattern: /&&/ });
export const LogicalOr = createToken({ name: "LogicalOr", pattern: /\|\|/ });
export const LogicalNot = createToken({ name: "LogicalNot", pattern: /!/ });

// -- Delimiters -------------------------------------------------------
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });

// -- Punctuation ------------------------------------------------------
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const At = createToken({ name: "At", pattern: /@/ });
export const Equals = createToken({ name: "Equals", pattern: /=/ });
export const Pipe = createToken({ name: "Pipe", pattern: /\|/ });
export const Slash = createToken({ name: "Slash", pattern: /\// });
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });
export const Star = createToken({ name: "Star", pattern: /\*/ });
export const Question = createToken({ name: "Question", pattern: /\?/ });
export const Tilde = createToken({ name: "Tilde", pattern: /~/ });
export const Percent = createToken({ name: "Percent", pattern: /%/ });
export const New = kw("New", "new");

// -- Identifiers (must come after all keywords) -----------------------
export const BindingVariable = createToken({
  name: "BindingVariable",
  pattern: /\$[a-zA-Z_]\w*/,
});

export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_]\w*/,
});

// =====================================================================
// Token ordering matters — longer/more specific patterns first
// =====================================================================
export const allTokens: TokenType[] = [
  // Whitespace & comments first
  WhiteSpace,
  BlockComment,
  LineComment,

  // Literals (before identifiers)
  StringLiteral,
  FloatLiteral,
  IntegerLiteral,

  // Multi-char operators (before single-char)
  EqualsEquals,
  NotEquals,
  GreaterEquals,
  LessEquals,
  LogicalAnd,
  LogicalOr,

  // Hyphenated keywords (before Identifier can match the first word)
  NoLoop,
  LockOnActive,
  DateEffective,
  DateExpires,
  ActivationGroup,
  AgendaGroup,
  RuleflowGroup,
  AutoFocus,
  EntryPoint,

  // Multi-word action keyword (before shorter match)
  InsertLogical,

  // Hard keywords
  Package,
  Import,
  Function,
  Global,
  Rule,
  Query,
  End,

  // Structural keywords
  When,
  Then,
  Declare,
  Extends,
  Unit,
  Trait,

  // Attribute keywords
  Salience,
  Enabled,
  Duration,
  Timer,
  Calendars,
  Dialect,

  // LHS keywords
  Not,
  Exists,
  And,
  Or,
  In,
  From,
  Collect,
  Accumulate,
  Forall,
  Eval,
  Over,
  Window,

  // RHS keywords
  Insert,
  Update,
  Modify,
  Delete,
  Retract,

  // Special operators
  Matches,
  MemberOf,
  Contains,
  Soundslike,
  Str,

  // Other keywords
  New,

  // Boolean/null
  True,
  False,
  Null,

  // Single-char operators
  GreaterThan,
  LessThan,
  LogicalNot,

  // Delimiters
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,

  // Punctuation & arithmetic
  Semicolon,
  Colon,
  Comma,
  Dot,
  At,
  Equals,
  Pipe,
  Slash,
  Plus,
  Minus,
  Star,
  Question,
  Tilde,
  Percent,

  // Identifiers (last)
  BindingVariable,
  Identifier,
];

// =====================================================================
// Lexer instance
// =====================================================================
export const DrlLexer = new Lexer(allTokens);

/**
 * Tokenize a DRL source string.
 */
export function tokenize(text: string) {
  return DrlLexer.tokenize(text);
}
