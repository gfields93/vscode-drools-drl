/**
 * Documentation strings for DRL keywords, attributes, and operators.
 * Used by the hover provider to show rich Markdown popups.
 */

export interface DocEntry {
  title: string;
  description: string;
  syntax?: string;
  example?: string;
}

const docs: Record<string, DocEntry> = {
  // -- Hard Keywords --------------------------------------------------
  rule: {
    title: "`rule` — Rule Definition",
    description:
      "Defines a business rule with a name, optional attributes, conditions (LHS), and actions (RHS).",
    syntax: 'rule "Rule Name"\n    <attributes>\n    when\n        <conditions>\n    then\n        <actions>\nend',
    example:
      'rule "Check Age"\n    salience 10\n    when\n        $p : Person( age >= 18 )\n    then\n        $p.setAdult( true );\n        update( $p );\nend',
  },
  query: {
    title: "`query` — Query Definition",
    description:
      "Defines a named query that can be invoked to retrieve matching facts from working memory.",
    syntax: 'query "Query Name" (Type param)\n    <conditions>\nend',
  },
  declare: {
    title: "`declare` — Type Declaration",
    description:
      "Declares a new fact type directly in DRL, with typed fields and optional metadata annotations.",
    syntax: "declare TypeName\n    fieldName : Type\nend",
  },
  function: {
    title: "`function` — DRL Function",
    description:
      "Defines a helper function in Java syntax that can be called from rule actions.",
    syntax: "function ReturnType name(params) {\n    // Java code\n}",
  },
  package: {
    title: "`package` — Package Declaration",
    description:
      "Declares the package namespace for the DRL file. Rules in the same package share a namespace.",
    syntax: "package com.example.rules;",
  },
  import: {
    title: "`import` — Import Statement",
    description:
      "Imports a Java class or function for use in rules. Similar to Java import statements.",
    syntax: "import com.example.model.Person;",
  },
  global: {
    title: "`global` — Global Variable",
    description:
      "Declares a global variable accessible across all rules in the session. Globals are set programmatically from Java code.",
    syntax: "global Type name;",
  },
  when: {
    title: "`when` — Conditions Block",
    description:
      "Starts the Left-Hand Side (LHS) of a rule, containing pattern-matching conditions.",
  },
  then: {
    title: "`then` — Actions Block",
    description:
      "Starts the Right-Hand Side (RHS) of a rule, containing Java/MVEL code to execute when conditions match.",
  },
  end: {
    title: "`end` — Block Terminator",
    description: "Ends a rule, query, function, or type declaration block.",
  },

  // -- Rule Attributes ------------------------------------------------
  salience: {
    title: "`salience` — Rule Priority",
    description:
      "Sets the priority of the rule. Rules with higher salience values fire first.\n\n**Type:** integer\n\n**Default:** 0\n\n**Range:** any integer (positive or negative)",
    example: "salience 100",
  },
  "no-loop": {
    title: "`no-loop` — Prevent Re-activation",
    description:
      "When `true`, prevents the rule from being re-activated by its own consequence actions (e.g., after `update`).\n\n**Type:** boolean\n\n**Default:** false",
    example: "no-loop true",
  },
  "lock-on-active": {
    title: "`lock-on-active` — Lock While Active",
    description:
      "When `true`, prevents the rule from being activated again while its agenda group or ruleflow group is active. Stronger than `no-loop`.\n\n**Type:** boolean\n\n**Default:** false",
    example: "lock-on-active true",
  },
  "agenda-group": {
    title: "`agenda-group` — Agenda Group",
    description:
      'Assigns the rule to a named agenda group. Only rules in the currently focused agenda group are eligible to fire.\n\n**Type:** string\n\n**Default:** "MAIN"',
    example: 'agenda-group "validation"',
  },
  "activation-group": {
    title: "`activation-group` — Exclusive Group",
    description:
      "Only one rule in an activation group can fire. Once any rule in the group fires, all other activations in the group are cancelled.\n\n**Type:** string",
    example: 'activation-group "exclusive-check"',
  },
  "ruleflow-group": {
    title: "`ruleflow-group` — Ruleflow Group",
    description:
      "Associates the rule with a ruleflow group, used with jBPM process integration.\n\n**Type:** string",
    example: 'ruleflow-group "process-step-1"',
  },
  dialect: {
    title: "`dialect` — Rule Dialect",
    description:
      'Sets the language dialect for the rule\'s consequence block. Java is the default and recommended dialect.\n\n**Type:** "java" | "mvel"\n\n**Default:** "java"',
    example: 'dialect "java"',
  },
  enabled: {
    title: "`enabled` — Enable/Disable Rule",
    description:
      "When `false`, the rule is disabled and will not be evaluated.\n\n**Type:** boolean\n\n**Default:** true",
    example: "enabled false",
  },
  "auto-focus": {
    title: "`auto-focus` — Auto Focus Agenda Group",
    description:
      "When `true`, automatically gives focus to the rule's agenda group when the rule's conditions are met.\n\n**Type:** boolean\n\n**Default:** false",
    example: "auto-focus true",
  },
  "date-effective": {
    title: "`date-effective` — Effective Date",
    description:
      "The rule only fires on or after this date.\n\n**Type:** date string (dd-MMM-yyyy)",
    example: 'date-effective "01-Jan-2025"',
  },
  "date-expires": {
    title: "`date-expires` — Expiration Date",
    description:
      "The rule stops firing after this date.\n\n**Type:** date string (dd-MMM-yyyy)",
    example: 'date-expires "31-Dec-2025"',
  },
  duration: {
    title: "`duration` — Firing Delay",
    description:
      "Specifies a delay (in milliseconds) before the rule fires after activation.\n\n**Type:** integer (ms)",
    example: "duration 1000",
  },
  timer: {
    title: "`timer` — Timer-based Activation",
    description:
      "Activates the rule based on a timer. Supports interval (`int:`) and cron (`cron:`) expressions.\n\n**Type:** timer expression",
    example: 'timer (cron: 0/5 * * * * ?)',
  },
  calendars: {
    title: "`calendars` — Calendar Filter",
    description:
      "Associates the rule with a named Quartz calendar for time-based filtering.\n\n**Type:** string",
    example: 'calendars "weekdays"',
  },

  // -- LHS Keywords ---------------------------------------------------
  not: {
    title: "`not` — Negated Condition",
    description:
      "Matches when a fact of the specified type does NOT exist in working memory (or does not match the constraints).",
    syntax: "not Type( constraints )",
    example: "not Person( age < 18 )",
  },
  exists: {
    title: "`exists` — Existence Check",
    description:
      "Matches when at least one fact of the specified type exists in working memory matching the constraints. Unlike a plain pattern, it does not bind the fact.",
    syntax: "exists Type( constraints )",
    example: "exists Person( role == \"admin\" )",
  },
  and: {
    title: "`and` — Logical AND",
    description: "Combines two conditions with logical AND. Conditions are AND-ed by default.",
  },
  or: {
    title: "`or` — Logical OR",
    description:
      "Combines two conditions with logical OR. The rule fires for each alternative that matches.",
  },
  eval: {
    title: "`eval` — Evaluate Expression",
    description:
      "Evaluates an arbitrary boolean expression. Use sparingly — pattern matching is preferred.",
    syntax: "eval( expression )",
    example: "eval( $age > calculateMinAge() )",
  },
  forall: {
    title: "`forall` — Universal Quantifier",
    description:
      "Matches when ALL facts of the base pattern also match the constraining patterns.",
    syntax: "forall( basePattern, constrainingPatterns... )",
  },
  from: {
    title: "`from` — Data Source",
    description:
      "Specifies a source for pattern matching other than working memory (e.g., a global collection, method call, or entry point).",
    syntax: "Pattern( constraints ) from source",
    example: '$item : LineItem( price > 100 ) from $order.getItems()',
  },
  collect: {
    title: "`collect` — Collect Facts",
    description: "Collects all matching facts into a collection.",
    syntax: "$result : Collection() from collect( Pattern( constraints ) )",
  },
  accumulate: {
    title: "`accumulate` — Aggregate Values",
    description:
      "Iterates over matching facts and computes an aggregate value using built-in or custom functions.",
    syntax: "accumulate( sourcePattern, resultPattern : function( expression ) )",
    example:
      "accumulate(\n    $o : Order( status == \"completed\" ),\n    $total : sum( $o.getTotal() )\n)",
  },
  over: {
    title: "`over` — Sliding Window",
    description: "Applies a sliding window to event processing.",
    syntax: "over window:time( duration ) | over window:length( count )",
  },
  "entry-point": {
    title: "`entry-point` — Event Entry Point",
    description:
      "Specifies a named entry point for event stream processing.",
    syntax: 'from entry-point "StreamName"',
  },

  // -- RHS Action Keywords --------------------------------------------
  insert: {
    title: "`insert` — Insert Fact",
    description:
      "Inserts a new fact into working memory. The engine will evaluate the new fact against all rules.",
    syntax: "insert( new Type( args ) );",
  },
  insertLogical: {
    title: "`insertLogical` — Logical Insertion",
    description:
      "Inserts a fact that is automatically retracted when the conditions that caused the insertion are no longer true (truth maintenance).",
    syntax: "insertLogical( new Type( args ) );",
  },
  update: {
    title: "`update` — Update Fact",
    description:
      "Notifies the engine that a fact has been modified, triggering re-evaluation of affected rules.",
    syntax: "update( $binding );",
  },
  modify: {
    title: "`modify` — Modify Fact",
    description:
      "Modifies a fact's properties and notifies the engine in a single operation. Preferred over direct setter calls + `update()`.",
    syntax: "modify( $binding ) {\n    setProperty( value )\n};",
  },
  delete: {
    title: "`delete` — Delete Fact",
    description: "Removes a fact from working memory.",
    syntax: "delete( $binding );",
  },
  retract: {
    title: "`retract` — Retract Fact (deprecated)",
    description:
      "Removes a fact from working memory. **Deprecated** — use `delete` instead.",
    syntax: "retract( $binding );",
  },

  // -- Special Operators ----------------------------------------------
  matches: {
    title: "`matches` — Regex Match",
    description:
      "Tests if a string field matches a Java regular expression.",
    syntax: 'field matches "regex"',
    example: 'name matches "O\'Brien|McDonald.*"',
  },
  memberOf: {
    title: "`memberOf` — Collection Membership",
    description: "Tests if a value is a member of a collection.",
    syntax: "field memberOf $collection",
  },
  contains: {
    title: "`contains` — Collection Contains",
    description: "Tests if a collection field contains a specific value.",
    syntax: "collectionField contains value",
  },
  soundslike: {
    title: "`soundslike` — Phonetic Match",
    description: "Tests if a string sounds like another string (Soundex algorithm).",
    syntax: 'field soundslike "value"',
  },
  in: {
    title: "`in` — Value in List",
    description: "Tests if a field value is in a list of values.",
    syntax: 'field in ("value1", "value2", "value3")',
  },

  // -- Metadata Annotations -------------------------------------------
  key: {
    title: "`@key` — Key Field",
    description:
      "Marks a field as part of the type's identity. Key fields are used in `equals()` and `hashCode()` generation.",
  },
  role: {
    title: "`@role` — Fact Role",
    description:
      'Sets the role of a declared type. Use `@role(event)` to mark a type as an event for CEP.\n\n**Values:** "event" | "fact"',
  },
  timestamp: {
    title: "`@timestamp` — Event Timestamp",
    description: "Specifies which field provides the timestamp for event processing.",
  },
  expires: {
    title: "`@expires` — Event Expiration",
    description: "Sets how long an event remains in working memory after its timestamp.",
  },
};

/**
 * Get documentation for a keyword or identifier.
 */
export function getDocumentation(word: string): DocEntry | undefined {
  return docs[word];
}
