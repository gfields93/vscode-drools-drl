import { TextEdit, Range as LspRange } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Format a DRL document with consistent indentation.
 */
export function formatDocument(
  textDoc: TextDocument,
  indentSize: number = 4,
  insertFinalNewline: boolean = true
): TextEdit[] {
  const text = textDoc.getText();
  const lines = text.split("\n");
  const indent = " ".repeat(indentSize);
  const formatted: string[] = [];

  let currentIndent = 0;
  let inRhsBlock = false;
  let prevWasBlank = false;
  let inFunctionBody = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip consecutive blank lines
    if (trimmed === "") {
      if (!prevWasBlank) {
        formatted.push("");
        prevWasBlank = true;
      }
      continue;
    }
    prevWasBlank = false;

    // Track function body braces
    if (inFunctionBody) {
      if (trimmed === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          inFunctionBody = false;
          formatted.push("}");
          continue;
        }
      }
      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") braceDepth--;
      }
      formatted.push(indent.repeat(braceDepth) + trimmed);
      continue;
    }

    // Determine indent based on keyword
    if (/^(package|import)\b/.test(trimmed)) {
      formatted.push(trimmed);
      continue;
    }

    if (/^global\b/.test(trimmed)) {
      formatted.push(trimmed);
      continue;
    }

    if (/^(rule|query)\b/.test(trimmed)) {
      currentIndent = 0;
      formatted.push(trimmed);
      currentIndent = 1;
      continue;
    }

    if (/^declare\b/.test(trimmed)) {
      currentIndent = 0;
      formatted.push(trimmed);
      currentIndent = 1;
      continue;
    }

    if (/^function\b/.test(trimmed)) {
      currentIndent = 0;
      formatted.push(trimmed);
      if (trimmed.includes("{")) {
        inFunctionBody = true;
        braceDepth = 1;
      }
      continue;
    }

    if (/^when\b/.test(trimmed)) {
      formatted.push(indent + trimmed);
      currentIndent = 2;
      inRhsBlock = false;
      continue;
    }

    if (/^then\b/.test(trimmed)) {
      formatted.push(indent + trimmed);
      currentIndent = 2;
      inRhsBlock = true;
      continue;
    }

    if (/^end\b/.test(trimmed)) {
      currentIndent = 0;
      inRhsBlock = false;
      formatted.push(trimmed);
      continue;
    }

    // Inside declare block — fields and annotations at 1 indent
    if (currentIndent === 1 && !inRhsBlock) {
      formatted.push(indent + trimmed);
      continue;
    }

    // Rule attributes (between rule name and when)
    if (currentIndent === 1) {
      formatted.push(indent + trimmed);
      continue;
    }

    // LHS conditions or RHS actions at 2 indents
    if (currentIndent === 2) {
      // Handle modify block braces
      if (trimmed === "};") {
        formatted.push(indent.repeat(2) + trimmed);
        continue;
      }
      if (trimmed === "};" || trimmed === "}") {
        formatted.push(indent.repeat(2) + trimmed);
        continue;
      }
      formatted.push(indent.repeat(2) + trimmed);
      continue;
    }

    // Default — no indent change
    formatted.push(indent.repeat(currentIndent) + trimmed);
  }

  // Ensure blank lines between top-level constructs
  let result = formatted.join("\n");

  // Remove trailing whitespace from each line
  result = result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Insert final newline
  if (insertFinalNewline && !result.endsWith("\n")) {
    result += "\n";
  }

  // Return a single text edit replacing the entire document
  const fullRange: LspRange = {
    start: { line: 0, character: 0 },
    end: textDoc.positionAt(text.length),
  };

  return [TextEdit.replace(fullRange, result)];
}
