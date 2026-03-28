import { Hover, TextDocumentPositionParams } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDocumentation } from "../utils/documentation";

/**
 * Provide hover information for DRL keywords, attributes, and operators.
 */
export function getHover(
  textDoc: TextDocument,
  params: TextDocumentPositionParams
): Hover | null {
  const word = getWordAtPosition(textDoc, params.position);
  if (!word) return null;

  const doc = getDocumentation(word);
  if (!doc) return null;

  const lines: string[] = [];
  lines.push(`### ${doc.title}`);
  lines.push("");
  lines.push(doc.description);

  if (doc.syntax) {
    lines.push("");
    lines.push("**Syntax:**");
    lines.push("```drl");
    lines.push(doc.syntax);
    lines.push("```");
  }

  if (doc.example) {
    lines.push("");
    lines.push("**Example:**");
    lines.push("```drl");
    lines.push(doc.example);
    lines.push("```");
  }

  return {
    contents: {
      kind: "markdown",
      value: lines.join("\n"),
    },
  };
}

/**
 * Extract the word under the cursor.
 */
function getWordAtPosition(
  doc: TextDocument,
  position: { line: number; character: number }
): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt(position);

  // Walk backwards to find word start
  let start = offset;
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
  }

  // Walk forwards to find word end
  let end = offset;
  while (end < text.length && isWordChar(text[end])) {
    end++;
  }

  if (start === end) return null;

  const word = text.substring(start, end);

  // Also check for hyphenated keywords (no-loop, lock-on-active, etc.)
  // by looking further back for a hyphen
  let extStart = start;
  while (extStart > 0) {
    const prevChar = text[extStart - 1];
    if (prevChar === "-") {
      extStart--;
      while (extStart > 0 && isWordChar(text[extStart - 1])) {
        extStart--;
      }
    } else {
      break;
    }
  }

  if (extStart < start) {
    const extWord = text.substring(extStart, end);
    const extDoc = getDocumentation(extWord);
    if (extDoc) return extWord;
  }

  return word;
}

function isWordChar(ch: string): boolean {
  return /[\w$]/.test(ch);
}
