/**
 * File watcher integration for incremental index updates.
 *
 * Handles LSP file change notifications from the client to keep the
 * workspace index up to date. The actual file watching is done by the
 * VS Code client — this module processes the notifications on the server side.
 */

import { WorkspaceIndex } from "./workspace-index";

export type FileChangeType = "created" | "changed" | "deleted";

export interface FileChangeEvent {
  uri: string;
  type: FileChangeType;
}

/**
 * Process file change events and update the workspace index accordingly.
 */
export function processFileChanges(
  events: FileChangeEvent[],
  index: WorkspaceIndex
): { drlChanged: boolean; javaChanged: boolean; classpathChanged: boolean } {
  let drlChanged = false;
  let javaChanged = false;
  let classpathChanged = false;

  for (const event of events) {
    const filePath = uriToPath(event.uri);
    if (!filePath) continue;

    if (filePath.endsWith(".drl") || filePath.endsWith(".rule")) {
      handleDrlChange(event, filePath, index);
      drlChanged = true;
    } else if (filePath.endsWith(".java")) {
      handleJavaChange(event, filePath, index);
      javaChanged = true;
    } else if (filePath.endsWith(".class")) {
      handleClassChange(event, filePath, index);
      javaChanged = true;
    } else if (
      filePath.endsWith("pom.xml") ||
      filePath.endsWith("build.gradle") ||
      filePath.endsWith("build.gradle.kts")
    ) {
      classpathChanged = true;
    }
  }

  return { drlChanged, javaChanged, classpathChanged };
}

// ── Internal handlers ─────────────────────────────────────────────────

function handleDrlChange(
  event: FileChangeEvent,
  filePath: string,
  index: WorkspaceIndex
): void {
  const uri = event.uri;

  switch (event.type) {
    case "created":
    case "changed": {
      // The actual re-parse happens through the document change flow
      // in server.ts — this is for files changed outside the editor
      try {
        const fs = require("fs");
        const content = fs.readFileSync(filePath, "utf-8");
        index.updateDrlDocument(uri, content);
      } catch {
        // File may be temporarily unavailable
      }
      break;
    }
    case "deleted":
      index.removeDrlDocument(uri);
      break;
  }
}

function handleJavaChange(
  event: FileChangeEvent,
  filePath: string,
  index: WorkspaceIndex
): void {
  switch (event.type) {
    case "created":
    case "changed":
      index.onJavaFileChanged(filePath);
      break;
    case "deleted":
      index.onJavaFileDeleted(filePath);
      break;
  }
}

function handleClassChange(
  event: FileChangeEvent,
  filePath: string,
  index: WorkspaceIndex
): void {
  // Treat class file changes the same as Java source changes
  // (typically happens after compilation)
  handleJavaChange(event, filePath, index);
}

/**
 * Convert a file URI to a local file path.
 */
function uriToPath(uri: string): string | undefined {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice(7));
  }
  return undefined;
}
