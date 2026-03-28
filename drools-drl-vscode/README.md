# Drools DRL - VS Code Extension

Language support for Drools Rule Language (`.drl`) files in Visual Studio Code.

## Features

- **Syntax Highlighting** - Rich, accurate TextMate grammar covering all major DRL constructs: packages, imports, rules, queries, functions, type declarations, LHS patterns, RHS action blocks, and more
- **Language Configuration** - Comment toggling (`//` and `/* */`), bracket matching, auto-closing pairs, folding, and auto-indentation
- **Snippets** - 30+ snippets for common DRL patterns including rules, queries, functions, type declarations, LHS conditions, RHS actions, and rule attributes

## Supported File Extensions

- `.drl` - Standard Drools Rule Language files
- `.rule` - Alternative rule file extension

## Drools Version Support

- **Drools 7.x** - Full support
- **Drools 8.x** - Full support including rule units and OOPath notation
- **Drools 10.x** - Basic support for new constructs

## Snippet Prefixes

| Prefix | Description |
|---|---|
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
2. Press `F5` to launch the Extension Development Host
3. Open a `.drl` file to test highlighting and snippets

## License

MIT
