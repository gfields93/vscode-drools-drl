import { IRecognitionException } from "chevrotain";
import { ParseError, Range } from "./ast";

/**
 * Convert Chevrotain parse errors into our ParseError format.
 */
export function mapParseErrors(errors: IRecognitionException[]): ParseError[] {
  return errors.map((e) => {
    const token = e.token;
    const range: Range = {
      startLine: (token.startLine ?? 1) - 1,
      startColumn: (token.startColumn ?? 1) - 1,
      endLine: (token.endLine ?? token.startLine ?? 1) - 1,
      endColumn: (token.endColumn ?? token.startColumn ?? 1),
    };

    return {
      message: e.message,
      range,
      severity: "error",
      code: "DRL009",
    };
  });
}

/**
 * Create a range from Chevrotain token positions (1-based) to
 * our 0-based Range format.
 */
export function tokenRange(token: {
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}): Range {
  return {
    startLine: (token.startLine ?? 1) - 1,
    startColumn: (token.startColumn ?? 1) - 1,
    endLine: (token.endLine ?? token.startLine ?? 1) - 1,
    endColumn: (token.endColumn ?? token.startColumn ?? 1),
  };
}

/**
 * Merge two ranges into one spanning both.
 */
export function mergeRanges(a: Range, b: Range): Range {
  return {
    startLine: Math.min(a.startLine, b.startLine),
    startColumn:
      a.startLine < b.startLine
        ? a.startColumn
        : a.startLine === b.startLine
          ? Math.min(a.startColumn, b.startColumn)
          : b.startColumn,
    endLine: Math.max(a.endLine, b.endLine),
    endColumn:
      a.endLine > b.endLine
        ? a.endColumn
        : a.endLine === b.endLine
          ? Math.max(a.endColumn, b.endColumn)
          : b.endColumn,
  };
}
