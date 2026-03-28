import { IRecognitionException } from "chevrotain";
import { ParseError, Range } from "./ast";

/**
 * Convert Chevrotain parse errors into our ParseError format.
 */
export function mapParseErrors(errors: IRecognitionException[]): ParseError[] {
  return errors.map((e) => {
    const range = tokenRange(e.token);
    return {
      message: e.message,
      range,
      severity: "error" as const,
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
} | undefined | null): Range {
  if (!token) {
    return { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 };
  }
  // Use safeInt to guard against NaN from Chevrotain error-recovery tokens,
  // where positions are NaN (not null/undefined, so ?? doesn't catch them).
  const sl = safeInt(token.startLine, 1);
  const sc = safeInt(token.startColumn, 1);
  const el = safeInt(token.endLine, sl);
  const ec = safeInt(token.endColumn, sc);
  return {
    startLine: sl - 1,
    startColumn: sc - 1,
    endLine: el - 1,
    endColumn: ec,
  };
}

/** Return `value` if it is a finite number, otherwise `fallback`. */
function safeInt(value: number | undefined | null, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback;
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
