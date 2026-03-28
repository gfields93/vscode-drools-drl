# vscode-drools-drl

A Visual Studio Code extension that provides comprehensive language support for Drools Rule Language (DRL) files. The goal is to bring modern IDE intelligence to Drools rule authoring — syntax highlighting, code completion, diagnostics, type-aware validation, and cross-file analysis — without requiring a JRE or depending on experimental upstream tooling.

## Motivation

Existing VS Code extensions for DRL are either unmaintained, minimal in scope, or require a Java runtime. The official `drools-lsp` project from the KIE group is experimental and tightly coupled to specific Drools versions via ANTLR4. This project takes a different approach: a self-contained TypeScript implementation that works out of the box and progressively adds intelligence across three phases.

## Project Status

The project is being developed in three phases. Phase 1 is complete; Phases 2 and 3 are in design.

### Phase 1: Declarative Language Features (Complete)

The foundation is in place with no language server required:

- **Syntax highlighting** — A comprehensive TextMate grammar covering all major DRL constructs: packages, imports, rules, queries, functions, type declarations, LHS patterns, RHS action blocks, binding variables, operators, metadata annotations, and embedded Java/MVEL in `then` blocks.
- **Language configuration** — Comment toggling (`//` and `/* */`), bracket matching, auto-closing pairs, folding for rule/query/function/declare blocks, auto-indentation, and `$variable` word selection.
- **Snippet library** — 30+ snippets for common DRL patterns: rule scaffolding, LHS conditions (`accumulate`, `collect`, `not`, `exists`, `forall`, `from`, `eval`), RHS actions (`insert`, `modify`, `update`, `delete`), type declarations, and rule attributes.
- **Drools version coverage** — Supports Drools 7.x and 8.x syntax, with basic coverage for 10.x/OOPath constructs.
- **Test fixtures** — Eight DRL test files validating grammar correctness across basic rules, complex LHS patterns, attributes, comments, type declarations, functions/queries, Drools 8 features, and edge cases.

### Phase 2: Basic Language Server (Planned)

A TypeScript-based Language Server Protocol (LSP) implementation providing intelligent editing without a JRE dependency:

- **DRL parser** — A Chevrotain-based parser that produces an AST with error recovery for incomplete/invalid code.
- **Real-time diagnostics** — Syntax errors reported as VS Code problems with line/column positions and actionable messages (13+ error codes covering missing keywords, duplicate rules, unused bindings, deprecated constructs).
- **Context-aware completion** — DRL keywords, rule attributes, known fact types, binding variables, field names from declared types, RHS action keywords, and accumulate functions — all context-sensitive to cursor position.
- **Hover documentation** — Rich Markdown documentation for DRL keywords, attributes, operators, and annotations.
- **Document symbols** — Outline view showing rules, queries, functions, declared types, globals, and their attributes in a navigable hierarchy.
- **Document formatting** — Consistent indentation and spacing with configurable indent size.

### Phase 3: Project-Aware Intelligence (Planned)

The extension becomes a full development environment for teams working with Drools at scale:

- **Java classpath integration** — Resolve imported types to their Java class definitions via Maven (`pom.xml`) or Gradle (`build.gradle`) dependency resolution, with a custom `.class` file parser for JAR dependencies and regex-based extraction for workspace source files.
- **Type-aware editing** — Field-name completion from resolved Java types in LHS patterns, type-checked constraint operators, setter method completion in `modify` blocks, and import path completion from the classpath.
- **Cross-file intelligence** — Workspace-wide indexing of all DRL constructs, go-to-definition (DRL-to-DRL and DRL-to-Java), find references, rename refactoring across files, and cross-file diagnostics (duplicate rule names, unused imports, unresolved types).
- **Rule analysis** — Static detection of rule conflicts (overlapping conditions with contradictory actions), redundant rules, and circular dependencies via insert/modify chains.
- **Code actions** — Quick fixes for adding missing imports, replacing deprecated constructs, suggesting closest-match field names, and removing unused imports.

## Supported File Types

- `.drl` — Standard Drools Rule Language files
- `.rule` — Alternative rule file extension

## Getting Started

1. Clone the repository
2. Open `drools-drl-vscode/` in VS Code
3. Press `F5` to launch the Extension Development Host
4. Open any `.drl` file to see syntax highlighting and use snippets

To package as a VSIX for distribution:

```bash
cd drools-drl-vscode
npx @vscode/vsce package
```

Then install via **Extensions > Install from VSIX...** in VS Code.

## Project Structure

```
drools-drl-vscode/
├── syntaxes/drl.tmLanguage.json      # TextMate grammar
├── snippets/drl.snippets.json        # Snippet definitions
├── language-configuration.json       # Bracket/comment/folding config
├── test-fixtures/                    # DRL files for grammar validation
├── package.json                      # Extension manifest
└── tsconfig.json                     # TypeScript config (for Phase 2)
```

## License

MIT
