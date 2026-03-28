# Drools DRL - VS Code Extension

Language support for Drools Rule Language (`.drl`) files in Visual Studio Code.

## Features

### Syntax & Editing
- **Syntax Highlighting** - Rich TextMate grammar covering all DRL constructs: packages, imports, rules, queries, functions, type declarations, LHS patterns, RHS action blocks, and more
- **Language Configuration** - Comment toggling (`//` and `/* */`), bracket matching, auto-closing pairs, folding, and auto-indentation
- **Snippets** - 30+ snippets for common DRL patterns including rules, queries, functions, type declarations, LHS conditions, RHS actions, and rule attributes
- **Document Formatting** - Auto-indent and format DRL files with configurable indent size

### Language Server (LSP)
- **Real-time Diagnostics** - 16 diagnostic checks covering syntax errors, semantic validation, type checking, and cross-file analysis
- **Code Completion** - Context-aware completions for keywords, fact types, field names (from resolved Java types), constraint operators, setter methods, and more
- **Hover Information** - Documentation tooltips for DRL keywords and rule attributes
- **Document Symbols** - Outline view and breadcrumb navigation for rules, queries, functions, globals, and type declarations

### Java Classpath Integration
- **Auto-detection** - Automatically detects Maven (`pom.xml`) and Gradle (`build.gradle`) projects
- **Type Resolution** - Resolves imported Java types from the classpath to provide field-level completions and validation
- **Class File Parsing** - Custom `.class` file parser extracts type metadata without external dependencies
- **Java Source Parsing** - Lightweight regex-based parser for `.java` source files in the workspace

### Cross-File Intelligence
- **Go-to-Definition** - Navigate from fact types to Java sources or DRL `declare` blocks, from bindings to their declarations, from `extends` to parent rules, and more
- **Find References** - Locate all usages of rule names, fact types, globals, queries, and functions across the workspace
- **Rename** - Rename binding variables, rule names, declared types, globals, queries, and functions with multi-file support
- **Code Actions / Quick Fixes** - Remove unused imports, replace deprecated `retract` with `delete`, add missing imports, rename duplicate rules

### Rule Analysis
- **Conflict Detection** - Identifies rules with overlapping conditions that modify the same field to contradictory values
- **Shadowing Detection** - Flags rules that are always preempted by higher-salience rules with identical conditions
- **Circular Dependency Detection** - Detects insert chains that could cause infinite rule activation loops
- **Type Checking** - Validates constraint type compatibility (e.g., numeric operators on string fields)

## Diagnostics

| Code | Severity | Description |
|------|----------|-------------|
| DRL006 | Error | Duplicate rule name within the same file |
| DRL007 | Warning | Empty `when` block (rule fires unconditionally) |
| DRL008 | Warning | Empty `then` block (rule has no actions) |
| DRL009 | Error | Parser/lexer syntax error |
| DRL010 | Warning | Binding variable declared but never used |
| DRL011 | Error | Binding variable used in RHS but not declared in LHS |
| DRL012 | Error | Malformed import statement |
| DRL013 | Warning | Deprecated `retract()` usage (use `delete()`) |
| DRL014 | Error | Fact type used in pattern without import or declare |
| DRL101 | Error | Field does not exist on resolved Java type |
| DRL102 | Warning | Type mismatch in constraint expression |
| DRL103 | Error | Import cannot be resolved on classpath |
| DRL104 | Warning | Unused import |
| DRL201 | Error | Duplicate rule name across files |
| DRL202 | Warning | Conflicting rule modifications |
| DRL203 | Info | Rule shadowed by higher-salience rule |
| DRL204 | Warning | Circular rule dependency detected |

## Commands

| Command | Description |
|---------|-------------|
| `Drools: Rebuild Workspace Index` | Force re-index of all DRL files and Java types |
| `Drools: Rebuild Classpath` | Re-resolve the Java classpath from build files |
| `Drools: Show Type Info` | Display resolved type information for the fact type under the cursor |
| `Drools: Analyze Rule Conflicts` | Run conflict, shadowing, and circular dependency analysis |
| `Drools: Show Rule Dependencies` | Display which fact types a rule triggers and is triggered by |
| `Drools: List All Rules` | Searchable list of all rules across the workspace |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `drools.validation.enabled` | `true` | Enable/disable real-time validation |
| `drools.validation.debounceMs` | `200` | Delay before re-validating after a change |
| `drools.formatting.indentSize` | `4` | Spaces per indentation level |
| `drools.formatting.insertFinalNewline` | `true` | Ensure file ends with a newline |
| `drools.java.classpath` | `"auto"` | Classpath resolution: `auto`, `maven`, `gradle`, or `manual` |
| `drools.java.sourceRoots` | `["src/main/java"]` | Java source roots to scan for type definitions |
| `drools.java.manualClasspath` | `[]` | Manual classpath entries (JARs or directories) |
| `drools.java.useJavapFallback` | `false` | Fall back to `javap` for unsupported class file features |
| `drools.analysis.conflictDetection` | `true` | Enable rule conflict and redundancy analysis |
| `drools.analysis.maxRulesForConflictAnalysis` | `500` | Max rules for conflict analysis |
| `drools.index.excludePatterns` | `["**/test/**", ...]` | Glob patterns to exclude from indexing |

## Supported File Extensions

- `.drl` - Standard Drools Rule Language files
- `.rule` - Alternative rule file extension

## Drools Version Support

- **Drools 7.x** - Full support
- **Drools 8.x** - Full support including rule units and OOPath notation
- **Drools 10.x** - Basic support for new constructs

## Snippet Prefixes

| Prefix | Description |
|--------|-------------|
| `rule` | Complete rule block |
| `ruleattr` | Rule with common attributes |
| `query` | Named query block |
| `function` | Java function in DRL |
| `declare` | Type declaration |
| `bind` | Bound pattern (`$var : Type(...)`) |
| `accumulate` | Accumulate pattern |
| `modify` | Modify a bound fact |
| `insert` | Insert a new fact |
| `salience` | Salience attribute |

See the full snippet catalog by typing a prefix in a `.drl` file.

## Installation

### From VSIX

```bash
npx @vscode/vsce package
```

Then install via **Extensions: Install from VSIX...** in VS Code.

## Development

1. Open this folder in VS Code
2. Run `npm install` to install dependencies
3. Press `F5` to launch the Extension Development Host
4. Open a `.drl` file to test features

### Running Tests

```bash
npm test
```

## License

MIT
