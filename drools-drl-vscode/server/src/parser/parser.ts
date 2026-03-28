import { CstParser, IToken, CstNode, tokenMatcher } from "chevrotain";
import * as T from "./lexer";
import * as AST from "./ast";
import { tokenRange, mergeRanges, mapParseErrors } from "./errors";

// =====================================================================
// CST Parser
// =====================================================================

class DrlCstParser extends CstParser {
  constructor() {
    super(T.allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });
    this.performSelfAnalysis();
  }

  // -- Top level ------------------------------------------------------
  public drlFile = this.RULE("drlFile", () => {
    this.OPTION(() => this.SUBRULE(this.packageDeclaration));
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.unitDeclaration) },
        { ALT: () => this.SUBRULE(this.importDeclaration) },
        { ALT: () => this.SUBRULE(this.globalDeclaration) },
        { ALT: () => this.SUBRULE(this.declareBlock) },
        { ALT: () => this.SUBRULE(this.functionBlock) },
        { ALT: () => this.SUBRULE(this.queryBlock) },
        { ALT: () => this.SUBRULE(this.ruleBlock) },
      ]);
    });
  });

  // -- Package --------------------------------------------------------
  public packageDeclaration = this.RULE("packageDeclaration", () => {
    this.CONSUME(T.Package);
    this.SUBRULE(this.qualifiedName);
    this.OPTION(() => this.CONSUME(T.Semicolon));
  });

  // -- Unit -----------------------------------------------------------
  public unitDeclaration = this.RULE("unitDeclaration", () => {
    this.CONSUME(T.Unit);
    this.CONSUME(T.Identifier, { LABEL: "unitName" });
    this.OPTION(() => this.CONSUME(T.Semicolon));
  });

  // -- Import ---------------------------------------------------------
  public importDeclaration = this.RULE("importDeclaration", () => {
    this.CONSUME(T.Import);
    this.OPTION(() => this.CONSUME(T.Function));
    this.SUBRULE(this.qualifiedName);
    this.OPTION2(() => this.CONSUME(T.Semicolon));
  });

  // -- Global ---------------------------------------------------------
  public globalDeclaration = this.RULE("globalDeclaration", () => {
    this.CONSUME(T.Global);
    this.SUBRULE(this.typeReference, { LABEL: "type" });
    this.CONSUME(T.Identifier, { LABEL: "name" });
    this.OPTION(() => this.CONSUME(T.Semicolon));
  });

  // -- Declare --------------------------------------------------------
  public declareBlock = this.RULE("declareBlock", () => {
    this.CONSUME(T.Declare);
    this.OPTION(() => this.CONSUME(T.Trait));
    this.CONSUME(T.Identifier, { LABEL: "typeName" });
    this.OPTION2(() => {
      this.CONSUME(T.Extends);
      this.CONSUME2(T.Identifier, { LABEL: "superType" });
    });
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.metadataAnnotation) },
        { ALT: () => this.SUBRULE(this.fieldDeclaration) },
      ]);
    });
    this.CONSUME(T.End);
  });

  public fieldDeclaration = this.RULE("fieldDeclaration", () => {
    this.CONSUME(T.Identifier, { LABEL: "fieldName" });
    this.CONSUME(T.Colon);
    this.SUBRULE(this.typeReference);
    this.OPTION(() => {
      this.CONSUME(T.Equals);
      this.SUBRULE(this.literalValue);
    });
    this.MANY(() => this.SUBRULE(this.metadataAnnotation));
  });

  public metadataAnnotation = this.RULE("metadataAnnotation", () => {
    this.CONSUME(T.At);
    this.CONSUME(T.Identifier, { LABEL: "key" });
    this.OPTION(() => {
      this.CONSUME(T.LParen);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.CONSUME(T.StringLiteral) },
          { ALT: () => this.CONSUME(T.IntegerLiteral) },
          { ALT: () => this.CONSUME(T.True) },
          { ALT: () => this.CONSUME(T.False) },
          { ALT: () => this.CONSUME2(T.Identifier) },
          { ALT: () => this.CONSUME(T.Comma) },
        ]);
      });
      this.CONSUME(T.RParen);
    });
  });

  // -- Function -------------------------------------------------------
  public functionBlock = this.RULE("functionBlock", () => {
    this.CONSUME(T.Function);
    this.SUBRULE(this.typeReference, { LABEL: "returnType" });
    this.CONSUME(T.Identifier, { LABEL: "funcName" });
    this.CONSUME(T.LParen);
    this.OPTION(() => this.SUBRULE(this.parameterList));
    this.CONSUME(T.RParen);
    this.CONSUME(T.LBrace);
    this.SUBRULE(this.balancedBraceContent);
    this.CONSUME(T.RBrace);
  });

  // -- Query ----------------------------------------------------------
  public queryBlock = this.RULE("queryBlock", () => {
    this.CONSUME(T.Query);
    this.OR([
      { ALT: () => this.CONSUME(T.StringLiteral, { LABEL: "queryName" }) },
      { ALT: () => this.CONSUME(T.Identifier, { LABEL: "queryName" }) },
    ]);
    this.OPTION(() => {
      this.CONSUME(T.LParen);
      this.OPTION2(() => this.SUBRULE(this.parameterList));
      this.CONSUME(T.RParen);
    });
    this.MANY(() => this.SUBRULE(this.lhsCondition));
    this.CONSUME(T.End);
  });

  // -- Rule -----------------------------------------------------------
  public ruleBlock = this.RULE("ruleBlock", () => {
    this.CONSUME(T.Rule);
    this.CONSUME(T.StringLiteral, { LABEL: "ruleName" });
    this.OPTION(() => {
      this.CONSUME(T.Extends);
      this.CONSUME2(T.StringLiteral, { LABEL: "parentRule" });
    });
    this.MANY(() => this.SUBRULE(this.ruleAttribute));
    this.CONSUME(T.When);
    this.MANY2(() => this.SUBRULE(this.lhsCondition));
    this.CONSUME(T.Then);
    this.MANY3(() => this.SUBRULE(this.rhsAction));
    this.CONSUME(T.End);
  });

  // -- Rule Attributes ------------------------------------------------
  public ruleAttribute = this.RULE("ruleAttribute", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(T.Salience);
          this.OR2([
            { ALT: () => this.CONSUME(T.IntegerLiteral) },
            { ALT: () => this.CONSUME(T.BindingVariable) },
          ]);
        },
      },
      {
        ALT: () => {
          this.OR3([
            { ALT: () => this.CONSUME(T.NoLoop) },
            { ALT: () => this.CONSUME(T.LockOnActive) },
            { ALT: () => this.CONSUME(T.AutoFocus) },
            { ALT: () => this.CONSUME(T.Enabled) },
          ]);
          this.OPTION(() => {
            this.OR4([
              { ALT: () => this.CONSUME(T.True) },
              { ALT: () => this.CONSUME(T.False) },
            ]);
          });
        },
      },
      {
        ALT: () => {
          this.OR5([
            { ALT: () => this.CONSUME(T.AgendaGroup) },
            { ALT: () => this.CONSUME(T.ActivationGroup) },
            { ALT: () => this.CONSUME(T.RuleflowGroup) },
            { ALT: () => this.CONSUME(T.Dialect) },
            { ALT: () => this.CONSUME(T.Calendars) },
            { ALT: () => this.CONSUME(T.DateEffective) },
            { ALT: () => this.CONSUME(T.DateExpires) },
          ]);
          this.CONSUME(T.StringLiteral);
        },
      },
      {
        ALT: () => {
          this.OR6([
            { ALT: () => this.CONSUME(T.Duration) },
            { ALT: () => this.CONSUME(T.Timer) },
          ]);
          this.OR7([
            { ALT: () => this.CONSUME2(T.IntegerLiteral) },
            {
              ALT: () => {
                this.CONSUME(T.LParen);
                this.SUBRULE(this.balancedParenContent);
                this.CONSUME(T.RParen);
              },
            },
          ]);
        },
      },
    ]);
  });

  // -- LHS Conditions -------------------------------------------------
  public lhsCondition = this.RULE("lhsCondition", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.notCondition) },
      { ALT: () => this.SUBRULE(this.existsCondition) },
      { ALT: () => this.SUBRULE(this.forallCondition) },
      { ALT: () => this.SUBRULE(this.accumulateCondition) },
      { ALT: () => this.SUBRULE(this.evalCondition) },
      { ALT: () => this.SUBRULE(this.ooPathCondition) },
      { ALT: () => this.SUBRULE(this.patternCondition) },
    ]);
    this.OPTION(() => {
      this.OR2([
        { ALT: () => this.CONSUME(T.And) },
        { ALT: () => this.CONSUME(T.Or) },
      ]);
    });
  });

  public notCondition = this.RULE("notCondition", () => {
    this.CONSUME(T.Not);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(T.LParen);
          this.AT_LEAST_ONE(() => this.SUBRULE(this.lhsCondition));
          this.CONSUME(T.RParen);
        },
      },
      { ALT: () => this.SUBRULE(this.patternCondition) },
    ]);
  });

  public existsCondition = this.RULE("existsCondition", () => {
    this.CONSUME(T.Exists);
    this.OR([
      {
        ALT: () => {
          this.CONSUME(T.LParen);
          this.AT_LEAST_ONE(() => this.SUBRULE(this.lhsCondition));
          this.CONSUME(T.RParen);
        },
      },
      { ALT: () => this.SUBRULE(this.patternCondition) },
    ]);
  });

  public forallCondition = this.RULE("forallCondition", () => {
    this.CONSUME(T.Forall);
    this.CONSUME(T.LParen);
    this.AT_LEAST_ONE(() => this.SUBRULE(this.lhsCondition));
    this.CONSUME(T.RParen);
  });

  public accumulateCondition = this.RULE("accumulateCondition", () => {
    this.CONSUME(T.Accumulate);
    this.CONSUME(T.LParen);
    this.SUBRULE(this.balancedParenContent);
    this.CONSUME(T.RParen);
  });

  public evalCondition = this.RULE("evalCondition", () => {
    this.CONSUME(T.Eval);
    this.CONSUME(T.LParen);
    this.SUBRULE(this.balancedParenContent);
    this.CONSUME(T.RParen);
  });

  // -- OOPath Conditions (Drools 8+) -----------------------------------
  // Syntax: $binding : /segment[ constraints ] / segment[ constraints ]
  public ooPathCondition = this.RULE("ooPathCondition", () => {
    // Optional binding before the path
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(T.BindingVariable, { LABEL: "binding" }) },
        { ALT: () => this.CONSUME(T.Identifier, { LABEL: "binding" }) },
      ]);
      this.CONSUME(T.Colon);
    });
    // First segment: /name[ constraints ]
    this.CONSUME(T.Slash);
    this.CONSUME2(T.Identifier, { LABEL: "segmentName" });
    this.CONSUME(T.LBracket);
    this.SUBRULE(this.balancedBracketContent);
    this.CONSUME(T.RBracket);
    // Additional segments: / name[ constraints ]
    this.MANY(() => {
      this.CONSUME2(T.Slash);
      this.CONSUME3(T.Identifier, { LABEL: "segmentName" });
      this.CONSUME2(T.LBracket);
      this.SUBRULE2(this.balancedBracketContent);
      this.CONSUME2(T.RBracket);
    });
  });

  public patternCondition = this.RULE("patternCondition", () => {
    // Optional binding: $var : or var :
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(T.BindingVariable, { LABEL: "binding" }) },
        { ALT: () => this.CONSUME(T.Identifier, { LABEL: "binding" }) },
      ]);
      this.CONSUME(T.Colon);
    });
    // Fact type (may be qualified: java.util.List, com.example.Foo)
    this.SUBRULE(this.qualifiedName, { LABEL: "factType" });
    // Constraints in parentheses
    this.CONSUME(T.LParen);
    this.SUBRULE(this.balancedParenContent, { LABEL: "constraints" });
    this.CONSUME(T.RParen);
    // Optional from clause
    this.OPTION2(() => {
      this.CONSUME(T.From);
      this.SUBRULE(this.fromExpression);
    });
    // Optional over window
    this.OPTION3(() => {
      this.CONSUME(T.Over);
      this.SUBRULE(this.windowSpec);
    });
  });

  public fromExpression = this.RULE("fromExpression", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(T.Collect);
          this.CONSUME(T.LParen);
          this.SUBRULE(this.balancedParenContent);
          this.CONSUME(T.RParen);
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.Accumulate);
          this.CONSUME2(T.LParen);
          this.SUBRULE2(this.balancedParenContent);
          this.CONSUME2(T.RParen);
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.EntryPoint);
          this.CONSUME(T.StringLiteral);
        },
      },
      {
        ALT: () => {
          // General expression: global.method(), $binding.method(), etc.
          this.AT_LEAST_ONE(() => {
            this.OR2([
              { ALT: () => this.CONSUME(T.BindingVariable) },
              { ALT: () => this.CONSUME(T.Identifier) },
              { ALT: () => this.CONSUME(T.Dot) },
              {
                ALT: () => {
                  this.CONSUME3(T.LParen);
                  this.SUBRULE3(this.balancedParenContent);
                  this.CONSUME3(T.RParen);
                },
              },
            ]);
          });
        },
      },
    ]);
  });

  public windowSpec = this.RULE("windowSpec", () => {
    this.CONSUME(T.Window);
    this.CONSUME(T.Colon);
    this.CONSUME(T.Identifier); // "time" or "length"
    this.CONSUME(T.LParen);
    this.SUBRULE(this.balancedParenContent);
    this.CONSUME(T.RParen);
  });

  // -- RHS Actions (shallow parsing) ----------------------------------
  public rhsAction = this.RULE("rhsAction", () => {
    this.OR([
      {
        ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(T.Insert) },
            { ALT: () => this.CONSUME(T.InsertLogical) },
            { ALT: () => this.CONSUME(T.Update) },
            { ALT: () => this.CONSUME(T.Delete) },
            { ALT: () => this.CONSUME(T.Retract) },
          ]);
          this.CONSUME(T.LParen);
          this.SUBRULE(this.balancedParenContent);
          this.CONSUME(T.RParen);
          this.OPTION(() => this.CONSUME(T.Semicolon));
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.Modify);
          this.CONSUME2(T.LParen);
          this.SUBRULE2(this.balancedParenContent);
          this.CONSUME2(T.RParen);
          this.CONSUME(T.LBrace);
          this.SUBRULE(this.balancedBraceContent);
          this.CONSUME(T.RBrace);
          this.OPTION2(() => this.CONSUME2(T.Semicolon));
        },
      },
      {
        // Any other RHS statement — consume tokens until semicolon
        ALT: () => {
          this.AT_LEAST_ONE(() => this.SUBRULE(this.anyRhsToken));
          this.OPTION3(() => this.CONSUME3(T.Semicolon));
        },
      },
    ]);
  });

  // -- Helpers --------------------------------------------------------
  public qualifiedName = this.RULE("qualifiedName", () => {
    this.CONSUME(T.Identifier);
    this.MANY(() => {
      this.CONSUME(T.Dot);
      this.OR([
        { ALT: () => this.CONSUME2(T.Identifier) },
        { ALT: () => this.CONSUME(T.Str) }, // "str" as part of a package name
        { ALT: () => this.CONSUME(T.Star) }, // wildcard imports: com.example.*
      ]);
    });
  });

  public typeReference = this.RULE("typeReference", () => {
    this.SUBRULE(this.qualifiedName);
    // Optional generics: <Type, Type>
    this.OPTION(() => {
      this.CONSUME(T.LessThan);
      this.SUBRULE2(this.typeReference);
      this.MANY(() => {
        this.CONSUME(T.Comma);
        this.SUBRULE3(this.typeReference);
      });
      this.CONSUME(T.GreaterThan);
    });
    // Optional array: []
    this.OPTION2(() => {
      this.CONSUME(T.LBracket);
      this.CONSUME(T.RBracket);
    });
  });

  public parameterList = this.RULE("parameterList", () => {
    this.SUBRULE(this.parameter);
    this.MANY(() => {
      this.CONSUME(T.Comma);
      this.SUBRULE2(this.parameter);
    });
  });

  public parameter = this.RULE("parameter", () => {
    this.SUBRULE(this.typeReference);
    this.OR([
      { ALT: () => this.CONSUME(T.Identifier) },
      { ALT: () => this.CONSUME(T.BindingVariable) },
    ]);
  });

  public literalValue = this.RULE("literalValue", () => {
    this.OR([
      { ALT: () => this.CONSUME(T.StringLiteral) },
      { ALT: () => this.CONSUME(T.FloatLiteral) },
      { ALT: () => this.CONSUME(T.IntegerLiteral) },
      { ALT: () => this.CONSUME(T.True) },
      { ALT: () => this.CONSUME(T.False) },
      { ALT: () => this.CONSUME(T.Null) },
    ]);
  });

  /**
   * Consume any balanced content within parentheses.
   * Handles nested parens, brackets, and braces.
   */
  public balancedParenContent = this.RULE("balancedParenContent", () => {
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(T.LParen);
            this.SUBRULE(this.balancedParenContent);
            this.CONSUME(T.RParen);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LBrace);
            this.SUBRULE(this.balancedBraceContent);
            this.CONSUME(T.RBrace);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LBracket);
            this.SUBRULE(this.balancedBracketContent);
            this.CONSUME(T.RBracket);
          },
        },
        { ALT: () => this.SUBRULE(this.anyNonClosingToken) },
      ]);
    });
  });

  public balancedBraceContent = this.RULE("balancedBraceContent", () => {
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(T.LBrace);
            this.SUBRULE(this.balancedBraceContent);
            this.CONSUME(T.RBrace);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LParen);
            this.SUBRULE(this.balancedParenContent);
            this.CONSUME(T.RParen);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LBracket);
            this.SUBRULE(this.balancedBracketContent);
            this.CONSUME(T.RBracket);
          },
        },
        { ALT: () => this.SUBRULE(this.anyNonClosingToken) },
      ]);
    });
  });

  public balancedBracketContent = this.RULE("balancedBracketContent", () => {
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(T.LBracket);
            this.SUBRULE(this.balancedBracketContent);
            this.CONSUME(T.RBracket);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LParen);
            this.SUBRULE(this.balancedParenContent);
            this.CONSUME(T.RParen);
          },
        },
        {
          ALT: () => {
            this.CONSUME(T.LBrace);
            this.SUBRULE(this.balancedBraceContent);
            this.CONSUME(T.RBrace);
          },
        },
        { ALT: () => this.SUBRULE(this.anyNonClosingToken) },
      ]);
    });
  });

  /**
   * Match any single token that isn't a closing delimiter.
   * Used inside balanced-content rules.
   */
  public anyNonClosingToken = this.RULE("anyNonClosingToken", () => {
    this.OR([
      { ALT: () => this.CONSUME(T.StringLiteral) },
      { ALT: () => this.CONSUME(T.FloatLiteral) },
      { ALT: () => this.CONSUME(T.IntegerLiteral) },
      { ALT: () => this.CONSUME(T.True) },
      { ALT: () => this.CONSUME(T.False) },
      { ALT: () => this.CONSUME(T.Null) },
      { ALT: () => this.CONSUME(T.BindingVariable) },
      { ALT: () => this.CONSUME(T.Identifier) },
      { ALT: () => this.CONSUME(T.Dot) },
      { ALT: () => this.CONSUME(T.Comma) },
      { ALT: () => this.CONSUME(T.Colon) },
      { ALT: () => this.CONSUME(T.Semicolon) },
      { ALT: () => this.CONSUME(T.At) },
      { ALT: () => this.CONSUME(T.Equals) },
      { ALT: () => this.CONSUME(T.EqualsEquals) },
      { ALT: () => this.CONSUME(T.NotEquals) },
      { ALT: () => this.CONSUME(T.GreaterEquals) },
      { ALT: () => this.CONSUME(T.LessEquals) },
      { ALT: () => this.CONSUME(T.GreaterThan) },
      { ALT: () => this.CONSUME(T.LessThan) },
      { ALT: () => this.CONSUME(T.LogicalAnd) },
      { ALT: () => this.CONSUME(T.LogicalOr) },
      { ALT: () => this.CONSUME(T.LogicalNot) },
      { ALT: () => this.CONSUME(T.Pipe) },
      { ALT: () => this.CONSUME(T.Slash) },
      { ALT: () => this.CONSUME(T.Plus) },
      { ALT: () => this.CONSUME(T.Minus) },
      { ALT: () => this.CONSUME(T.Star) },
      { ALT: () => this.CONSUME(T.Question) },
      { ALT: () => this.CONSUME(T.Tilde) },
      { ALT: () => this.CONSUME(T.Percent) },
      { ALT: () => this.CONSUME(T.New) },
      // Allow keywords inside balanced content (e.g. Java code in function bodies)
      { ALT: () => this.CONSUME(T.Package) },
      { ALT: () => this.CONSUME(T.Import) },
      { ALT: () => this.CONSUME(T.Function) },
      { ALT: () => this.CONSUME(T.Global) },
      { ALT: () => this.CONSUME(T.Rule) },
      { ALT: () => this.CONSUME(T.Query) },
      { ALT: () => this.CONSUME(T.End) },
      { ALT: () => this.CONSUME(T.When) },
      { ALT: () => this.CONSUME(T.Then) },
      { ALT: () => this.CONSUME(T.Declare) },
      { ALT: () => this.CONSUME(T.Extends) },
      { ALT: () => this.CONSUME(T.Unit) },
      { ALT: () => this.CONSUME(T.Trait) },
      { ALT: () => this.CONSUME(T.Not) },
      { ALT: () => this.CONSUME(T.Exists) },
      { ALT: () => this.CONSUME(T.And) },
      { ALT: () => this.CONSUME(T.Or) },
      { ALT: () => this.CONSUME(T.In) },
      { ALT: () => this.CONSUME(T.From) },
      { ALT: () => this.CONSUME(T.Collect) },
      { ALT: () => this.CONSUME(T.Accumulate) },
      { ALT: () => this.CONSUME(T.Forall) },
      { ALT: () => this.CONSUME(T.Eval) },
      { ALT: () => this.CONSUME(T.Over) },
      { ALT: () => this.CONSUME(T.Window) },
      { ALT: () => this.CONSUME(T.EntryPoint) },
      { ALT: () => this.CONSUME(T.Insert) },
      { ALT: () => this.CONSUME(T.InsertLogical) },
      { ALT: () => this.CONSUME(T.Update) },
      { ALT: () => this.CONSUME(T.Modify) },
      { ALT: () => this.CONSUME(T.Delete) },
      { ALT: () => this.CONSUME(T.Retract) },
      { ALT: () => this.CONSUME(T.Matches) },
      { ALT: () => this.CONSUME(T.MemberOf) },
      { ALT: () => this.CONSUME(T.Contains) },
      { ALT: () => this.CONSUME(T.Soundslike) },
      { ALT: () => this.CONSUME(T.Str) },
      { ALT: () => this.CONSUME(T.Salience) },
      { ALT: () => this.CONSUME(T.NoLoop) },
      { ALT: () => this.CONSUME(T.LockOnActive) },
      { ALT: () => this.CONSUME(T.AutoFocus) },
      { ALT: () => this.CONSUME(T.Enabled) },
      { ALT: () => this.CONSUME(T.AgendaGroup) },
      { ALT: () => this.CONSUME(T.ActivationGroup) },
      { ALT: () => this.CONSUME(T.RuleflowGroup) },
      { ALT: () => this.CONSUME(T.Dialect) },
      { ALT: () => this.CONSUME(T.Calendars) },
      { ALT: () => this.CONSUME(T.DateEffective) },
      { ALT: () => this.CONSUME(T.DateExpires) },
      { ALT: () => this.CONSUME(T.Duration) },
      { ALT: () => this.CONSUME(T.Timer) },
    ]);
  });

  /**
   * Any token valid in RHS context except End and closing delimiters.
   * Used for "other" RHS statements.
   */
  public anyRhsToken = this.RULE("anyRhsToken", () => {
    this.OR([
      { ALT: () => this.CONSUME(T.StringLiteral) },
      { ALT: () => this.CONSUME(T.FloatLiteral) },
      { ALT: () => this.CONSUME(T.IntegerLiteral) },
      { ALT: () => this.CONSUME(T.True) },
      { ALT: () => this.CONSUME(T.False) },
      { ALT: () => this.CONSUME(T.Null) },
      { ALT: () => this.CONSUME(T.BindingVariable) },
      { ALT: () => this.CONSUME(T.Identifier) },
      { ALT: () => this.CONSUME(T.Dot) },
      { ALT: () => this.CONSUME(T.Comma) },
      { ALT: () => this.CONSUME(T.Colon) },
      { ALT: () => this.CONSUME(T.At) },
      { ALT: () => this.CONSUME(T.Equals) },
      { ALT: () => this.CONSUME(T.EqualsEquals) },
      { ALT: () => this.CONSUME(T.NotEquals) },
      { ALT: () => this.CONSUME(T.GreaterEquals) },
      { ALT: () => this.CONSUME(T.LessEquals) },
      { ALT: () => this.CONSUME(T.GreaterThan) },
      { ALT: () => this.CONSUME(T.LessThan) },
      { ALT: () => this.CONSUME(T.LogicalAnd) },
      { ALT: () => this.CONSUME(T.LogicalOr) },
      { ALT: () => this.CONSUME(T.LogicalNot) },
      { ALT: () => this.CONSUME(T.Pipe) },
      { ALT: () => this.CONSUME(T.Slash) },
      { ALT: () => this.CONSUME(T.Plus) },
      { ALT: () => this.CONSUME(T.Minus) },
      { ALT: () => this.CONSUME(T.Star) },
      { ALT: () => this.CONSUME(T.Question) },
      { ALT: () => this.CONSUME(T.Tilde) },
      { ALT: () => this.CONSUME(T.Percent) },
      { ALT: () => this.CONSUME(T.New) },
      { ALT: () => this.CONSUME(T.Import) },
      { ALT: () => this.CONSUME(T.Function) },
      { ALT: () => this.CONSUME(T.Global) },
      // Keyword tokens that could appear in Java code
      { ALT: () => this.CONSUME(T.Not) },
      { ALT: () => this.CONSUME(T.And) },
      { ALT: () => this.CONSUME(T.Or) },
      { ALT: () => this.CONSUME(T.In) },
      { ALT: () => this.CONSUME(T.Matches) },
      { ALT: () => this.CONSUME(T.Contains) },
      { ALT: () => this.CONSUME(T.Str) },
      { ALT: () => this.CONSUME(T.Package) },
      {
        ALT: () => {
          this.CONSUME(T.LParen);
          this.SUBRULE(this.balancedParenContent);
          this.CONSUME(T.RParen);
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.LBrace);
          this.SUBRULE(this.balancedBraceContent);
          this.CONSUME(T.RBrace);
        },
      },
      {
        ALT: () => {
          this.CONSUME(T.LBracket);
          this.SUBRULE(this.balancedBracketContent);
          this.CONSUME(T.RBracket);
        },
      },
    ]);
  });
}

// Singleton parser instance (Chevrotain parsers are stateful but reusable)
const parserInstance = new DrlCstParser();

// =====================================================================
// AST Builder (CST Visitor)
// =====================================================================

function buildAst(cst: CstNode, text: string): AST.DrlFile {
  const result: AST.DrlFile = {
    kind: "DrlFile",
    imports: [],
    globals: [],
    declares: [],
    functions: [],
    queries: [],
    rules: [],
    errors: [],
    range: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
  };

  if (!cst.children) return result;

  // Package
  const pkgNodes = cst.children["packageDeclaration"] as CstNode[] | undefined;
  if (pkgNodes?.[0]) {
    result.packageDecl = visitPackage(pkgNodes[0]);
  }

  // Unit
  const unitNodes = cst.children["unitDeclaration"] as CstNode[] | undefined;
  if (unitNodes?.[0]) {
    result.unitDecl = visitUnit(unitNodes[0]);
  }

  // Imports
  const importNodes = cst.children["importDeclaration"] as CstNode[] | undefined;
  if (importNodes) {
    result.imports = importNodes.map(visitImport);
  }

  // Globals
  const globalNodes = cst.children["globalDeclaration"] as CstNode[] | undefined;
  if (globalNodes) {
    result.globals = globalNodes.map(visitGlobal);
  }

  // Declares
  const declareNodes = cst.children["declareBlock"] as CstNode[] | undefined;
  if (declareNodes) {
    result.declares = declareNodes.map(visitDeclare);
  }

  // Functions
  const funcNodes = cst.children["functionBlock"] as CstNode[] | undefined;
  if (funcNodes) {
    result.functions = funcNodes.map(visitFunction);
  }

  // Queries
  const queryNodes = cst.children["queryBlock"] as CstNode[] | undefined;
  if (queryNodes) {
    result.queries = queryNodes.map(visitQuery);
  }

  // Rules
  const ruleNodes = cst.children["ruleBlock"] as CstNode[] | undefined;
  if (ruleNodes) {
    result.rules = ruleNodes.map(visitRule);
  }

  // Compute file range
  const lines = text.split("\n");
  result.range = {
    startLine: 0,
    startColumn: 0,
    endLine: Math.max(0, lines.length - 1),
    endColumn: lines.length > 0 ? lines[lines.length - 1].length : 0,
  };

  return result;
}

function visitPackage(node: CstNode): AST.PackageDeclaration {
  const name = extractQualifiedName(node.children["qualifiedName"] as CstNode[]);
  const pkgToken = (node.children["Package"] as IToken[])[0];
  const lastToken = findLastToken(node);
  return {
    kind: "PackageDeclaration",
    name,
    range: mergeRanges(tokenRange(pkgToken), tokenRange(lastToken)),
  };
}

function visitUnit(node: CstNode): AST.UnitDeclaration {
  const nameToken = (node.children["unitName"] as IToken[])[0];
  const unitToken = (node.children["Unit"] as IToken[])[0];
  const lastToken = findLastToken(node);
  return {
    kind: "UnitDeclaration",
    name: nameToken.image,
    range: mergeRanges(tokenRange(unitToken), tokenRange(lastToken)),
  };
}

function visitImport(node: CstNode): AST.ImportDeclaration {
  const isFunction = !!(node.children["Function"] as IToken[] | undefined)?.length;
  const target = extractQualifiedName(node.children["qualifiedName"] as CstNode[]);
  // Detect "import static" — "static" is tokenized as Identifier
  const isStatic = target.startsWith("static.");
  const importToken = (node.children["Import"] as IToken[])[0];
  const lastToken = findLastToken(node);
  return {
    kind: "ImportDeclaration",
    isFunction,
    isStatic,
    target: isStatic ? target.substring(7) : target,
    range: mergeRanges(tokenRange(importToken), tokenRange(lastToken)),
  };
}

function visitGlobal(node: CstNode): AST.GlobalDeclaration {
  const typeNode = (node.children["type"] as CstNode[])[0];
  const type = extractTypeReference(typeNode);
  const nameToken = (node.children["name"] as IToken[])[0];
  const globalToken = (node.children["Global"] as IToken[])[0];
  const lastToken = findLastToken(node);
  return {
    kind: "GlobalDeclaration",
    type,
    name: nameToken.image,
    range: mergeRanges(tokenRange(globalToken), tokenRange(lastToken)),
  };
}

function visitDeclare(node: CstNode): AST.TypeDeclaration {
  const nameToken = (node.children["typeName"] as IToken[])[0];
  const isTrait = !!(node.children["Trait"] as IToken[] | undefined)?.length;
  const superTypeTokens = node.children["superType"] as IToken[] | undefined;
  const superType = superTypeTokens?.[0]?.image;

  const fieldNodes = node.children["fieldDeclaration"] as CstNode[] | undefined;
  const fields: AST.FieldDeclaration[] = fieldNodes?.map(visitField) ?? [];

  const metaNodes = node.children["metadataAnnotation"] as CstNode[] | undefined;
  const metadata: AST.MetadataAnnotation[] = metaNodes?.map(visitMetadata) ?? [];

  const declareToken = (node.children["Declare"] as IToken[])[0];
  const endToken = (node.children["End"] as IToken[])[0];

  return {
    kind: "TypeDeclaration",
    name: nameToken.image,
    superType,
    isTrait,
    fields,
    metadata,
    range: mergeRanges(tokenRange(declareToken), tokenRange(endToken)),
    nameRange: tokenRange(nameToken),
  };
}

function visitField(node: CstNode): AST.FieldDeclaration {
  const nameToken = (node.children["fieldName"] as IToken[])[0];
  const typeNode = node.children["typeReference"] as CstNode[];
  const type = extractTypeReference(typeNode[0]);

  const defaultNodes = node.children["literalValue"] as CstNode[] | undefined;
  let defaultValue: string | undefined;
  if (defaultNodes?.[0]) {
    defaultValue = extractLiteralValue(defaultNodes[0]);
  }

  const metaNodes = node.children["metadataAnnotation"] as CstNode[] | undefined;
  const metadata: AST.MetadataAnnotation[] = metaNodes?.map(visitMetadata) ?? [];

  const lastToken = findLastToken(node);
  return {
    kind: "FieldDeclaration",
    name: nameToken.image,
    type,
    defaultValue,
    metadata,
    range: mergeRanges(tokenRange(nameToken), tokenRange(lastToken)),
  };
}

function visitMetadata(node: CstNode): AST.MetadataAnnotation {
  const keyToken = (node.children["key"] as IToken[])[0];
  const atToken = (node.children["At"] as IToken[])[0];

  // Extract value from inside parens if present
  let value: string | undefined;
  const valueTokens: IToken[] = [
    ...((node.children["StringLiteral"] as IToken[] | undefined) ?? []),
    ...((node.children["IntegerLiteral"] as IToken[] | undefined) ?? []),
    ...((node.children["True"] as IToken[] | undefined) ?? []),
    ...((node.children["False"] as IToken[] | undefined) ?? []),
    ...((node.children["Identifier"] as IToken[] | undefined) ?? []),
  ];
  if (valueTokens.length > 0) {
    value = valueTokens.map((t) => t.image).join(", ");
  }

  const lastToken = findLastToken(node);
  return {
    kind: "MetadataAnnotation",
    key: keyToken.image,
    value,
    range: mergeRanges(tokenRange(atToken), tokenRange(lastToken)),
  };
}

function visitFunction(node: CstNode): AST.FunctionDeclaration {
  const nameToken = (node.children["funcName"] as IToken[])[0];
  const returnTypeNode = node.children["returnType"] as CstNode[];
  const returnType = extractTypeReference(returnTypeNode[0]);

  const paramNodes = node.children["parameterList"] as CstNode[] | undefined;
  const parameters: AST.ParameterDeclaration[] = paramNodes?.[0]
    ? visitParameterList(paramNodes[0])
    : [];

  const funcToken = (node.children["Function"] as IToken[])[0];
  const rBrace = (node.children["RBrace"] as IToken[])[0];

  return {
    kind: "FunctionDeclaration",
    returnType,
    name: nameToken.image,
    parameters,
    body: "", // We don't extract function body text
    range: mergeRanges(tokenRange(funcToken), tokenRange(rBrace)),
    nameRange: tokenRange(nameToken),
  };
}

function visitQuery(node: CstNode): AST.QueryDeclaration {
  const nameTokens = (node.children["queryName"] as IToken[]);
  const nameToken = nameTokens[0];
  const name = nameToken.image.replace(/^"|"$/g, "");

  const paramNodes = node.children["parameterList"] as CstNode[] | undefined;
  const parameters: AST.ParameterDeclaration[] = paramNodes?.[0]
    ? visitParameterList(paramNodes[0])
    : [];

  const condNodes = node.children["lhsCondition"] as CstNode[] | undefined;
  const conditions: AST.Condition[] = condNodes?.map(visitLhsCondition) ?? [];

  const queryToken = (node.children["Query"] as IToken[])[0];
  const endToken = (node.children["End"] as IToken[])[0];

  return {
    kind: "QueryDeclaration",
    name,
    parameters,
    conditions,
    range: mergeRanges(tokenRange(queryToken), tokenRange(endToken)),
    nameRange: tokenRange(nameToken),
  };
}

function visitRule(node: CstNode): AST.RuleDeclaration {
  const nameToken = (node.children["ruleName"] as IToken[])[0];
  const name = nameToken.image.replace(/^"|"$/g, "");

  const parentTokens = node.children["parentRule"] as IToken[] | undefined;
  const parentRule = parentTokens?.[0]?.image.replace(/^"|"$/g, "");

  // Attributes
  const attrNodes = node.children["ruleAttribute"] as CstNode[] | undefined;
  const attributes: AST.RuleAttribute[] = attrNodes?.map(visitAttribute) ?? [];

  // LHS
  const condNodes = node.children["lhsCondition"] as CstNode[] | undefined;
  const conditions: AST.Condition[] = condNodes?.map(visitLhsCondition) ?? [];

  const whenTokens = node.children["When"] as IToken[] | undefined;
  const thenTokens = node.children["Then"] as IToken[] | undefined;
  const whenToken = whenTokens?.[0];
  const thenToken = thenTokens?.[0];

  const ruleToken = (node.children["Rule"] as IToken[])[0];
  const endTokens = node.children["End"] as IToken[] | undefined;
  const endToken = endTokens?.[0];

  // Use the full extent of the node so nameRange is always contained in range
  const nodeLastToken = findLastToken(node);
  const fullRange = mergeRanges(tokenRange(ruleToken), tokenRange(nodeLastToken));
  const fallbackRange = fullRange;

  const lhs: AST.LHSBlock = {
    kind: "LHSBlock",
    conditions,
    range: whenToken && thenToken
      ? mergeRanges(tokenRange(whenToken), tokenRange(thenToken))
      : fallbackRange,
  };

  // RHS
  const actionNodes = node.children["rhsAction"] as CstNode[] | undefined;
  const actions: AST.RHSAction[] = actionNodes?.map(visitRhsAction) ?? [];

  const rhs: AST.RHSBlock = {
    kind: "RHSBlock",
    actions,
    rawText: "",
    range: thenToken && endToken
      ? mergeRanges(tokenRange(thenToken), tokenRange(endToken))
      : fallbackRange,
  };

  return {
    kind: "RuleDeclaration",
    name,
    parentRule,
    attributes,
    lhs,
    rhs,
    range: fullRange,
    nameRange: tokenRange(nameToken),
  };
}

function visitAttribute(node: CstNode): AST.RuleAttribute {
  const firstToken = findFirstToken(node);
  const lastToken = findLastToken(node);
  const name = firstToken.image;

  // Extract value
  let value: string | number | boolean = true;
  const stringTokens = node.children["StringLiteral"] as IToken[] | undefined;
  const intTokens = node.children["IntegerLiteral"] as IToken[] | undefined;
  const trueTokens = node.children["True"] as IToken[] | undefined;
  const falseTokens = node.children["False"] as IToken[] | undefined;

  if (stringTokens?.[0]) {
    value = stringTokens[0].image.replace(/^"|"$/g, "");
  } else if (intTokens?.[0]) {
    value = parseInt(intTokens[0].image, 10);
  } else if (falseTokens?.[0]) {
    value = false;
  } else if (trueTokens?.[0]) {
    value = true;
  }

  return {
    kind: "RuleAttribute",
    name,
    value,
    range: mergeRanges(tokenRange(firstToken), tokenRange(lastToken)),
  };
}

function visitLhsCondition(node: CstNode): AST.Condition {
  const children = node.children;

  if (children["notCondition"]) {
    return visitNotCondition((children["notCondition"] as CstNode[])[0]);
  }
  if (children["existsCondition"]) {
    return visitExistsCondition((children["existsCondition"] as CstNode[])[0]);
  }
  if (children["forallCondition"]) {
    return visitForallCondition((children["forallCondition"] as CstNode[])[0]);
  }
  if (children["accumulateCondition"]) {
    return visitAccumulateCondition((children["accumulateCondition"] as CstNode[])[0]);
  }
  if (children["evalCondition"]) {
    return visitEvalCondition((children["evalCondition"] as CstNode[])[0]);
  }
  if (children["ooPathCondition"]) {
    return visitOoPathCondition((children["ooPathCondition"] as CstNode[])[0]);
  }
  if (children["patternCondition"]) {
    return visitPatternCondition((children["patternCondition"] as CstNode[])[0]);
  }

  // Fallback — shouldn't happen with valid parse
  const firstToken = findFirstToken(node);
  return {
    kind: "PatternCondition",
    factType: "Unknown",
    constraints: "",
    range: tokenRange(firstToken),
    factTypeRange: tokenRange(firstToken),
  };
}

function visitNotCondition(node: CstNode): AST.NotCondition {
  const notToken = (node.children["Not"] as IToken[])[0];
  const lastToken = findLastToken(node);

  const condNodes = node.children["lhsCondition"] as CstNode[] | undefined;
  const patternNodes = node.children["patternCondition"] as CstNode[] | undefined;

  let condition: AST.Condition;
  if (condNodes?.[0]) {
    condition = visitLhsCondition(condNodes[0]);
  } else if (patternNodes?.[0]) {
    condition = visitPatternCondition(patternNodes[0]);
  } else {
    condition = {
      kind: "PatternCondition",
      factType: "Unknown",
      constraints: "",
      range: tokenRange(notToken),
      factTypeRange: tokenRange(notToken),
    };
  }

  return {
    kind: "NotCondition",
    condition,
    range: mergeRanges(tokenRange(notToken), tokenRange(lastToken)),
  };
}

function visitExistsCondition(node: CstNode): AST.ExistsCondition {
  const existsToken = (node.children["Exists"] as IToken[])[0];
  const lastToken = findLastToken(node);

  const condNodes = node.children["lhsCondition"] as CstNode[] | undefined;
  const patternNodes = node.children["patternCondition"] as CstNode[] | undefined;

  let condition: AST.Condition;
  if (condNodes?.[0]) {
    condition = visitLhsCondition(condNodes[0]);
  } else if (patternNodes?.[0]) {
    condition = visitPatternCondition(patternNodes[0]);
  } else {
    condition = {
      kind: "PatternCondition",
      factType: "Unknown",
      constraints: "",
      range: tokenRange(existsToken),
      factTypeRange: tokenRange(existsToken),
    };
  }

  return {
    kind: "ExistsCondition",
    condition,
    range: mergeRanges(tokenRange(existsToken), tokenRange(lastToken)),
  };
}

function visitForallCondition(node: CstNode): AST.ForallCondition {
  const forallToken = (node.children["Forall"] as IToken[])[0];
  const lastToken = findLastToken(node);
  const condNodes = node.children["lhsCondition"] as CstNode[] | undefined;
  const conditions = condNodes?.map(visitLhsCondition) ?? [];

  return {
    kind: "ForallCondition",
    conditions,
    range: mergeRanges(tokenRange(forallToken), tokenRange(lastToken)),
  };
}

function visitAccumulateCondition(node: CstNode): AST.AccumulateCondition {
  const accToken = (node.children["Accumulate"] as IToken[])[0];
  const lastToken = findLastToken(node);

  return {
    kind: "AccumulateCondition",
    source: {
      kind: "PatternCondition",
      factType: "AccumulateSource",
      constraints: "",
      range: mergeRanges(tokenRange(accToken), tokenRange(lastToken)),
      factTypeRange: tokenRange(accToken),
    },
    functions: "",
    range: mergeRanges(tokenRange(accToken), tokenRange(lastToken)),
  };
}

function visitEvalCondition(node: CstNode): AST.EvalCondition {
  const evalToken = (node.children["Eval"] as IToken[])[0];
  const lastToken = findLastToken(node);

  return {
    kind: "EvalCondition",
    expression: "",
    range: mergeRanges(tokenRange(evalToken), tokenRange(lastToken)),
  };
}

function visitOoPathCondition(node: CstNode): AST.OOPathCondition {
  let binding: AST.BindingVariable | undefined;
  const bindingTokens = node.children["binding"] as IToken[] | undefined;
  if (bindingTokens?.[0]) {
    binding = {
      kind: "BindingVariable",
      name: bindingTokens[0].image,
      range: tokenRange(bindingTokens[0]),
    };
  }

  const segmentNames = (node.children["segmentName"] as IToken[] | undefined) ?? [];
  const segments: AST.OOPathSegment[] = segmentNames.map((nameToken) => ({
    kind: "OOPathSegment",
    name: nameToken.image,
    constraints: "",
    range: tokenRange(nameToken),
  }));

  const firstToken = findFirstToken(node);
  const lastToken = findLastToken(node);

  return {
    kind: "OOPathCondition",
    binding,
    segments,
    range: mergeRanges(tokenRange(firstToken), tokenRange(lastToken)),
  };
}

function visitPatternCondition(node: CstNode): AST.PatternCondition {
  const factTypeNodes = node.children["factType"] as CstNode[] | undefined;
  const factType = factTypeNodes ? extractQualifiedName(factTypeNodes) : "Unknown";
  const factTypeFirstToken = factTypeNodes?.[0] ? findFirstToken(factTypeNodes[0]) : undefined;
  const factTypeLastToken = factTypeNodes?.[0] ? findLastToken(factTypeNodes[0]) : undefined;
  const factTypeRange = factTypeFirstToken && factTypeLastToken
    ? mergeRanges(tokenRange(factTypeFirstToken), tokenRange(factTypeLastToken))
    : undefined;

  let binding: AST.BindingVariable | undefined;
  const bindingTokens = node.children["binding"] as IToken[] | undefined;
  if (bindingTokens?.[0]) {
    binding = {
      kind: "BindingVariable",
      name: bindingTokens[0].image,
      range: tokenRange(bindingTokens[0]),
    };
  }

  const firstToken = findFirstToken(node);
  const lastToken = findLastToken(node);
  const fullRange = mergeRanges(tokenRange(firstToken), tokenRange(lastToken));

  const result: AST.PatternCondition = {
    kind: "PatternCondition",
    binding,
    factType,
    constraints: "",
    range: fullRange,
    factTypeRange: factTypeRange ?? fullRange,
  };

  // Check for from clause
  const fromNodes = node.children["fromExpression"] as CstNode[] | undefined;
  if (fromNodes?.[0]) {
    const fromCondition: AST.FromCondition = {
      kind: "FromCondition",
      pattern: result,
      expression: "",
      range: mergeRanges(tokenRange(firstToken), tokenRange(lastToken)),
    };
    return fromCondition as unknown as AST.PatternCondition;
  }

  return result;
}

function visitRhsAction(node: CstNode): AST.RHSAction {
  const firstToken = findFirstToken(node);
  const lastToken = findLastToken(node);

  let type: AST.RHSAction["type"] = "other";
  if (node.children["Insert"]) type = "insert";
  else if (node.children["InsertLogical"]) type = "insertLogical";
  else if (node.children["Update"]) type = "update";
  else if (node.children["Modify"]) type = "modify";
  else if (node.children["Delete"]) type = "delete";
  else if (node.children["Retract"]) type = "retract";

  return {
    kind: "RHSAction",
    type,
    range: mergeRanges(tokenRange(firstToken), tokenRange(lastToken)),
  };
}

function visitParameterList(node: CstNode): AST.ParameterDeclaration[] {
  const paramNodes = node.children["parameter"] as CstNode[] | undefined;
  if (!paramNodes) return [];

  return paramNodes.map((p) => {
    const typeNode = (p.children["typeReference"] as CstNode[] | undefined)?.[0];
    const nameToken = (p.children["Identifier"] as IToken[] | undefined)?.[0]
      ?? (p.children["BindingVariable"] as IToken[] | undefined)?.[0];
    if (!nameToken) {
      const firstToken = findFirstToken(p);
      return {
        kind: "ParameterDeclaration" as const,
        type: typeNode ? extractTypeReference(typeNode) : "",
        name: firstToken?.image ?? "",
        range: firstToken ? tokenRange(firstToken) : { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
      };
    }
    return {
      kind: "ParameterDeclaration" as const,
      type: typeNode ? extractTypeReference(typeNode) : "",
      name: nameToken.image,
      range: mergeRanges(tokenRange(findFirstToken(p)), tokenRange(nameToken)),
    };
  });
}

// =====================================================================
// Utility functions
// =====================================================================

function extractQualifiedName(nodes: CstNode[]): string {
  if (!nodes?.[0]) return "";
  const node = nodes[0];
  const identifiers = (node.children["Identifier"] as IToken[] | undefined) ?? [];
  const dots = (node.children["Dot"] as IToken[] | undefined) ?? [];
  const strTokens = (node.children["Str"] as IToken[] | undefined) ?? [];
  const starTokens = (node.children["Star"] as IToken[] | undefined) ?? [];

  // Reconstruct by ordering all tokens by position
  const allTokens = [...identifiers, ...dots, ...strTokens, ...starTokens].sort(
    (a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0)
  );
  return allTokens.map((t) => t.image).join("");
}

function extractTypeReference(node: CstNode): string {
  if (!node) return "";
  const qnNodes = node.children["qualifiedName"] as CstNode[] | undefined;
  let result = qnNodes ? extractQualifiedName(qnNodes) : "";

  // Check for generics
  const ltTokens = node.children["LessThan"] as IToken[] | undefined;
  if (ltTokens?.length) {
    const innerTypes = node.children["typeReference"] as CstNode[] | undefined;
    if (innerTypes) {
      const typeStrs = innerTypes.map(extractTypeReference);
      result += `<${typeStrs.join(", ")}>`;
    }
  }

  // Check for array
  const lbTokens = node.children["LBracket"] as IToken[] | undefined;
  if (lbTokens?.length) {
    result += "[]";
  }

  return result;
}

function extractLiteralValue(node: CstNode): string {
  const firstToken = findFirstToken(node);
  return firstToken.image;
}

/**
 * Find the first token in a CST node tree (by offset).
 */
function findFirstToken(node: CstNode | IToken): IToken {
  if ("image" in node && typeof (node as IToken).image === "string" && "startOffset" in node) {
    return node as IToken;
  }
  const cstNode = node as CstNode;
  let first: IToken | undefined;
  for (const key of Object.keys(cstNode.children || {})) {
    const children = cstNode.children[key];
    if (!children) continue;
    for (const child of children) {
      if (!child) continue;
      const token = findFirstToken(child as CstNode);
      if (token && (!first || (token.startOffset ?? Infinity) < (first.startOffset ?? Infinity))) {
        first = token;
      }
    }
  }
  return first!;
}

/**
 * Find the last token in a CST node tree (by offset).
 */
function findLastToken(node: CstNode | IToken): IToken {
  if ("image" in node && typeof (node as IToken).image === "string" && "startOffset" in node) {
    return node as IToken;
  }
  const cstNode = node as CstNode;
  let last: IToken | undefined;
  for (const key of Object.keys(cstNode.children || {})) {
    const children = cstNode.children[key];
    if (!children) continue;
    for (const child of children) {
      if (!child) continue;
      const token = findLastToken(child as CstNode);
      if (token && (!last || (token.startOffset ?? -1) > (last.startOffset ?? -1))) {
        last = token;
      }
    }
  }
  return last!;
}

// =====================================================================
// Public API
// =====================================================================

/**
 * Parse a DRL source string and return an AST.
 */
export function parse(text: string): AST.DrlFile {
  const lexResult = T.tokenize(text);

  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.drlFile();

  const ast = buildAst(cst, text);

  // Collect lexer errors
  for (const err of lexResult.errors) {
    ast.errors.push({
      message: err.message,
      range: tokenRange({
        startLine: err.line,
        startColumn: err.column,
        endLine: err.line,
        endColumn: err.column,
      }),
      severity: "error",
      code: "DRL009",
    });
  }

  // Collect parser errors
  ast.errors.push(...mapParseErrors(parserInstance.errors));

  return ast;
}
