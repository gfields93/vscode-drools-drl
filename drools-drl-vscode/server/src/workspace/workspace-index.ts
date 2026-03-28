/**
 * Workspace Index — central coordinator for Phase 3 indexing.
 *
 * Orchestrates the DRL index, Java type index, and classpath resolution.
 * Manages the index lifecycle: initial build, incremental updates, and
 * full rebuilds. Exposes a unified API for all LSP feature providers.
 */

import * as fs from "fs";
import * as path from "path";
import { DrlIndex } from "./drl-index";
import { JavaTypeIndex } from "./java-type-index";
import { DrlDocument } from "../model/drl-document";
import {
  resolveClasspath,
  ClasspathConfig,
  ClasspathResult,
} from "../classpath/classpath-resolver";
import { parseJavaSource } from "../classpath/java-source-parser";
import { readClassFile } from "../classpath/class-parser";
import { JavaTypeInfo, JavaFieldInfo, JavaMethodInfo } from "../classpath/type-model";
import { resolveTypeName } from "../analysis/import-resolver";
import * as AST from "../parser/ast";

export interface WorkspaceIndexStatus {
  state: "idle" | "indexing" | "ready" | "error";
  drlFileCount: number;
  javaTypeCount: number;
  classpathEntries: number;
  projectType: string;
  error?: string;
}

export class WorkspaceIndex {
  readonly drlIndex = new DrlIndex();
  readonly javaTypeIndex = new JavaTypeIndex();

  private workspaceRoot: string | undefined;
  private classpathResult: ClasspathResult | undefined;
  private classpathConfig: Partial<ClasspathConfig> = {};
  private status: WorkspaceIndexStatus = {
    state: "idle",
    drlFileCount: 0,
    javaTypeCount: 0,
    classpathEntries: 0,
    projectType: "none",
  };

  // Callback for progress reporting
  private onProgress?: (message: string, percentage?: number) => void;

  /**
   * Set the progress callback for reporting indexing status.
   */
  setProgressCallback(cb: (message: string, percentage?: number) => void): void {
    this.onProgress = cb;
  }

  /**
   * Initialize the workspace index for a given root directory.
   */
  async initialize(
    workspaceRoot: string,
    config?: Partial<ClasspathConfig>
  ): Promise<void> {
    this.workspaceRoot = workspaceRoot;
    if (config) this.classpathConfig = config;

    this.status.state = "indexing";
    this.reportProgress("Indexing workspace...", 0);

    try {
      // Phase 1: Scan DRL files
      this.reportProgress("Scanning DRL files...", 10);
      await this.scanDrlFiles();

      // Phase 2: Resolve classpath
      this.reportProgress("Resolving classpath...", 30);
      await this.resolveClasspath();

      // Phase 3: Scan Java source files
      this.reportProgress("Scanning Java sources...", 50);
      await this.scanJavaSources();

      // Phase 4: Resolve imported types from classpath (on-demand)
      this.reportProgress("Resolving imported types...", 70);
      await this.resolveImportedTypes();

      // Phase 5: Index DRL declared types as JavaTypeInfo
      this.reportProgress("Indexing DRL declarations...", 90);
      this.indexDrlDeclaredTypes();

      this.status.state = "ready";
      this.updateStatusCounts();
      this.reportProgress("Indexing complete", 100);
    } catch (err) {
      this.status.state = "error";
      this.status.error = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Get the current index status.
   */
  getStatus(): WorkspaceIndexStatus {
    return { ...this.status };
  }

  // ── DRL document management ─────────────────────────────────────────

  /**
   * Update a single DRL document in the index (incremental update).
   */
  updateDrlDocument(uri: string, text: string): DrlDocument {
    const doc = new DrlDocument(uri, text);
    this.drlIndex.updateDocument(uri, doc);
    this.updateStatusCounts();
    return doc;
  }

  /**
   * Remove a DRL document from the index.
   */
  removeDrlDocument(uri: string): void {
    this.drlIndex.removeDocument(uri);
    this.updateStatusCounts();
  }

  /**
   * Get a cached DRL document.
   */
  getDrlDocument(uri: string): DrlDocument | undefined {
    return this.drlIndex.getDocument(uri);
  }

  // ── Type resolution API ─────────────────────────────────────────────

  /**
   * Resolve a fact type name used in a DRL file to its Java type info.
   */
  resolveFactType(
    simpleName: string,
    doc: DrlDocument
  ): JavaTypeInfo | undefined {
    // 1. Check DRL declared types
    const drlType = this.drlIndex.findDeclaredType(simpleName);
    if (drlType) {
      return this.javaTypeIndex.resolveType(
        this.getDeclaredTypeFqn(simpleName, drlType.uri)
      );
    }

    // 2. Resolve through imports
    return resolveTypeName(
      simpleName,
      doc.ast.imports,
      doc.packageName,
      (fqn) => this.javaTypeIndex.resolveType(fqn),
      (name) => this.javaTypeIndex.resolveBySimpleName(name)
    );
  }

  /**
   * Get fields for a fact type used in a DRL pattern.
   */
  getFieldsForFactType(
    simpleName: string,
    doc: DrlDocument
  ): JavaFieldInfo[] {
    const type = this.resolveFactType(simpleName, doc);
    if (!type) return [];
    return this.javaTypeIndex.getFieldsForType(type.fullyQualifiedName);
  }

  /**
   * Get methods for a fact type (used in modify blocks).
   */
  getMethodsForFactType(
    simpleName: string,
    doc: DrlDocument
  ): JavaMethodInfo[] {
    const type = this.resolveFactType(simpleName, doc);
    if (!type) return [];
    return this.javaTypeIndex.getMethodsForType(type.fullyQualifiedName);
  }

  /**
   * Resolve a binding variable to its fact type.
   */
  resolveBindingType(
    bindingName: string,
    rule: AST.RuleDeclaration,
    doc: DrlDocument
  ): JavaTypeInfo | undefined {
    // Find the pattern condition that declares this binding
    for (const cond of rule.lhs.conditions) {
      const factType = findBindingFactType(cond, bindingName);
      if (factType) {
        return this.resolveFactType(factType, doc);
      }
    }
    return undefined;
  }

  // ── Classpath management ────────────────────────────────────────────

  /**
   * Force a classpath rebuild.
   */
  async rebuildClasspath(): Promise<void> {
    if (!this.workspaceRoot) return;
    this.javaTypeIndex.invalidateAll();
    await this.resolveClasspath();
    await this.scanJavaSources();
    await this.resolveImportedTypes();
    this.indexDrlDeclaredTypes();
    this.updateStatusCounts();
  }

  /**
   * Handle a Java source file change.
   */
  onJavaFileChanged(filePath: string): void {
    // Invalidate any type previously indexed from this file
    this.javaTypeIndex.invalidateBySource(filePath);

    // Re-parse the file
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const typeInfo = parseJavaSource(content, filePath);
      if (typeInfo) {
        this.javaTypeIndex.addType(typeInfo);
      }
    } catch {
      // File may have been deleted or is unreadable
    }

    this.updateStatusCounts();
  }

  /**
   * Handle a Java source file deletion.
   */
  onJavaFileDeleted(filePath: string): void {
    this.javaTypeIndex.invalidateBySource(filePath);
    this.updateStatusCounts();
  }

  // ── Private methods ─────────────────────────────────────────────────

  private async scanDrlFiles(): Promise<void> {
    if (!this.workspaceRoot) return;

    const drlFiles = findFilesRecursive(this.workspaceRoot, ".drl", [
      "node_modules", "target", "build", ".git",
    ]);

    for (const filePath of drlFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const uri = `file://${filePath}`;
        const doc = new DrlDocument(uri, content);
        this.drlIndex.updateDocument(uri, doc);
      } catch {
        // Skip unreadable files
      }
    }
  }

  private async resolveClasspath(): Promise<void> {
    if (!this.workspaceRoot) return;
    this.classpathResult = await resolveClasspath(
      this.workspaceRoot,
      this.classpathConfig
    );
    this.status.projectType = this.classpathResult.projectType;
  }

  private async scanJavaSources(): Promise<void> {
    if (!this.classpathResult) return;

    // Scan Java source roots
    for (const sourceRoot of this.classpathResult.sourceRoots) {
      const javaFiles = findFilesRecursive(sourceRoot, ".java", []);
      for (const filePath of javaFiles) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const typeInfo = parseJavaSource(content, filePath);
          if (typeInfo) {
            this.javaTypeIndex.addType(typeInfo);
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Scan class directories (e.g. target/classes)
    for (const classDir of this.classpathResult.classDirs) {
      const classFiles = findFilesRecursive(classDir, ".class", []);
      for (const filePath of classFiles) {
        // Skip inner classes and module-info
        const baseName = path.basename(filePath);
        if (baseName.includes("$") || baseName === "module-info.class") continue;

        try {
          const buffer = fs.readFileSync(filePath);
          const typeInfo = readClassFile(buffer, filePath);
          this.javaTypeIndex.addType(typeInfo);
        } catch {
          // Skip unparseable class files
        }
      }
    }
  }

  /**
   * Resolve types referenced in DRL imports from JAR files (on-demand).
   * Only resolves types that are actually imported, not every class in every JAR.
   */
  private async resolveImportedTypes(): Promise<void> {
    if (!this.classpathResult) return;

    const importedFqns = this.drlIndex.getAllImportedFqns();
    const unresolvedFqns = importedFqns.filter(
      (fqn) =>
        !fqn.endsWith(".*") &&
        !this.javaTypeIndex.resolveType(fqn)
    );

    if (unresolvedFqns.length === 0 || this.classpathResult.jarPaths.length === 0) {
      return;
    }

    // Build a set of FQNs to look for, converted to class file paths
    const targetPaths = new Map<string, string>();
    for (const fqn of unresolvedFqns) {
      const classPath = fqn.replace(/\./g, "/") + ".class";
      targetPaths.set(classPath, fqn);
    }

    // Scan JAR files for matching classes
    // Note: We use Node.js to read JARs as ZIP files
    for (const jarPath of this.classpathResult.jarPaths) {
      if (targetPaths.size === 0) break;
      await this.scanJarForTypes(jarPath, targetPaths);
    }
  }

  private async scanJarForTypes(
    jarPath: string,
    targetPaths: Map<string, string>
  ): Promise<void> {
    try {
      // Use a lightweight ZIP reader approach
      // We read the JAR's central directory to find matching entries
      const buffer = fs.readFileSync(jarPath);
      const entries = findZipEntries(buffer);

      for (const entry of entries) {
        if (targetPaths.has(entry.name)) {
          const classData = extractZipEntry(buffer, entry);
          if (classData) {
            try {
              const typeInfo = readClassFile(classData, jarPath);
              this.javaTypeIndex.addType(typeInfo);
              targetPaths.delete(entry.name);
            } catch {
              // Skip unparseable entries
            }
          }
        }
      }
    } catch {
      // Skip unreadable JARs
    }
  }

  /**
   * Index DRL declared types as JavaTypeInfo so they participate in
   * type resolution alongside Java classes.
   */
  private indexDrlDeclaredTypes(): void {
    for (const indexed of this.drlIndex.getAllDeclaredTypes()) {
      const doc = this.drlIndex.getDocument(indexed.uri);
      const packageName = doc?.packageName;
      const fqn = this.getDeclaredTypeFqn(indexed.decl.name, indexed.uri);

      const fields: import("../classpath/type-model").JavaFieldInfo[] =
        indexed.decl.fields.map((f) => ({
          name: f.name,
          type: f.type,
          accessorName:
            f.type === "boolean" || f.type === "Boolean"
              ? `is${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}`
              : `get${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}`,
          mutatorName: `set${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}`,
          isReadOnly: false,
          range: f.range,
        }));

      const typeInfo: JavaTypeInfo = {
        fullyQualifiedName: fqn,
        simpleName: indexed.decl.name,
        kind: indexed.decl.isTrait ? "interface" : "class",
        superClass: indexed.decl.superType,
        interfaces: [],
        fields,
        methods: [],
        isAbstract: indexed.decl.isTrait,
        source: "drl-declare",
        sourceUri: indexed.uri,
      };

      this.javaTypeIndex.addType(typeInfo);
    }
  }

  private getDeclaredTypeFqn(typeName: string, uri: string): string {
    const doc = this.drlIndex.getDocument(uri);
    const packageName = doc?.packageName;
    return packageName ? `${packageName}.${typeName}` : typeName;
  }

  private updateStatusCounts(): void {
    this.status.drlFileCount = this.drlIndex.documentCount;
    this.status.javaTypeCount = this.javaTypeIndex.size;
    this.status.classpathEntries = this.classpathResult
      ? this.classpathResult.jarPaths.length + this.classpathResult.classDirs.length
      : 0;
  }

  private reportProgress(message: string, percentage: number): void {
    this.onProgress?.(message, percentage);
  }
}

// ── Utility functions ─────────────────────────────────────────────────

/**
 * Recursively find files with a given extension.
 */
function findFilesRecursive(
  dir: string,
  extension: string,
  excludeDirs: string[]
): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        results.push(
          ...findFilesRecursive(path.join(dir, entry.name), extension, excludeDirs)
        );
      } else if (entry.name.endsWith(extension)) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // Permission errors, etc.
  }

  return results;
}

/**
 * Find the fact type for a binding variable in a condition tree.
 */
function findBindingFactType(
  condition: AST.Condition,
  bindingName: string
): string | undefined {
  switch (condition.kind) {
    case "PatternCondition":
      if (condition.binding?.name === bindingName) return condition.factType;
      return undefined;
    case "NotCondition":
      return findBindingFactType(condition.condition, bindingName);
    case "ExistsCondition":
      return findBindingFactType(condition.condition, bindingName);
    case "AndCondition":
      return (
        findBindingFactType(condition.left, bindingName) ||
        findBindingFactType(condition.right, bindingName)
      );
    case "OrCondition":
      return (
        findBindingFactType(condition.left, bindingName) ||
        findBindingFactType(condition.right, bindingName)
      );
    case "ForallCondition":
      for (const c of condition.conditions) {
        const result = findBindingFactType(c, bindingName);
        if (result) return result;
      }
      return undefined;
    case "FromCondition":
      return findBindingFactType(condition.pattern, bindingName);
    default:
      return undefined;
  }
}

// ── Minimal ZIP reader for JAR scanning ───────────────────────────────

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressionMethod: number;
}

/**
 * Find entries in a ZIP file by reading the central directory.
 */
function findZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // Find End of Central Directory record (search backwards from end)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return entries;

  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);

  let offset = centralDirOffset;
  for (let i = 0; i < entryCount && offset < buffer.length - 46; i++) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name.endsWith(".class")) {
      entries.push({
        name,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        compressionMethod,
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Extract a ZIP entry's data from the local file header.
 * Only supports stored (uncompressed) entries. For compressed entries
 * (deflate), we'd need zlib — skip those for now and rely on class dirs.
 */
function extractZipEntry(buffer: Buffer, entry: ZipEntry): Buffer | undefined {
  const localOffset = entry.localHeaderOffset;
  if (localOffset + 30 > buffer.length) return undefined;

  const sig = buffer.readUInt32LE(localOffset);
  if (sig !== 0x04034b50) return undefined;

  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;

  if (entry.compressionMethod === 0) {
    // Stored (uncompressed)
    return buffer.subarray(dataOffset, dataOffset + entry.uncompressedSize);
  }

  if (entry.compressionMethod === 8) {
    // Deflate — use zlib
    try {
      const zlib = require("zlib");
      const compressed = buffer.subarray(
        dataOffset,
        dataOffset + entry.compressedSize
      );
      return zlib.inflateRawSync(compressed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
