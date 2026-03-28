import { Range as LspRange, Position } from "vscode-languageserver";
import { Range as AstRange } from "../parser/ast";

/**
 * Convert our 0-based AST Range to an LSP Range.
 */
export function toLspRange(range: AstRange): LspRange {
  return {
    start: {
      line: Math.max(0, range.startLine),
      character: Math.max(0, range.startColumn),
    },
    end: {
      line: Math.max(0, range.endLine),
      character: Math.max(0, range.endColumn),
    },
  };
}

/**
 * Check if an LSP Position is inside an AST Range.
 */
export function isPositionInRange(pos: Position, range: AstRange): boolean {
  if (pos.line < range.startLine || pos.line > range.endLine) return false;
  if (pos.line === range.startLine && pos.character < range.startColumn) return false;
  if (pos.line === range.endLine && pos.character > range.endColumn) return false;
  return true;
}
