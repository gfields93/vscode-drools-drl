/**
 * Java Type Index.
 *
 * Maintains an in-memory index of resolved Java types, supporting lookup
 * by fully-qualified name or simple name. Handles inheritance resolution
 * for field and method lookups.
 */

import { JavaTypeInfo, JavaFieldInfo, JavaMethodInfo } from "../classpath/type-model";

export class JavaTypeIndex {
  /** FQN -> type info */
  private types = new Map<string, JavaTypeInfo>();
  /** Simple name -> FQN[] */
  private simpleNameIndex = new Map<string, string[]>();

  /**
   * Add a type to the index.
   */
  addType(type: JavaTypeInfo): void {
    this.types.set(type.fullyQualifiedName, type);

    // Update simple name index
    const existing = this.simpleNameIndex.get(type.simpleName) || [];
    if (!existing.includes(type.fullyQualifiedName)) {
      existing.push(type.fullyQualifiedName);
    }
    this.simpleNameIndex.set(type.simpleName, existing);
  }

  /**
   * Look up a type by fully-qualified name.
   */
  resolveType(fqn: string): JavaTypeInfo | undefined {
    return this.types.get(fqn);
  }

  /**
   * Look up all FQNs matching a simple name.
   */
  resolveBySimpleName(simpleName: string): string[] {
    return this.simpleNameIndex.get(simpleName) || [];
  }

  /**
   * Get all fields for a type, including inherited fields.
   */
  getFieldsForType(fqn: string): JavaFieldInfo[] {
    const fields: JavaFieldInfo[] = [];
    const visited = new Set<string>();
    this.collectFields(fqn, fields, visited);
    return fields;
  }

  /**
   * Get all methods for a type, including inherited methods.
   */
  getMethodsForType(fqn: string): JavaMethodInfo[] {
    const methods: JavaMethodInfo[] = [];
    const visited = new Set<string>();
    this.collectMethods(fqn, methods, visited);
    return methods;
  }

  /**
   * Invalidate a single type by FQN.
   */
  invalidateType(fqn: string): void {
    const type = this.types.get(fqn);
    if (type) {
      this.types.delete(fqn);
      const simpleList = this.simpleNameIndex.get(type.simpleName);
      if (simpleList) {
        const idx = simpleList.indexOf(fqn);
        if (idx >= 0) simpleList.splice(idx, 1);
        if (simpleList.length === 0) {
          this.simpleNameIndex.delete(type.simpleName);
        }
      }
    }
  }

  /**
   * Invalidate all types from a given source URI.
   */
  invalidateBySource(sourceUri: string): void {
    for (const [fqn, type] of this.types) {
      if (type.sourceUri === sourceUri) {
        this.invalidateType(fqn);
      }
    }
  }

  /**
   * Clear the entire index.
   */
  invalidateAll(): void {
    this.types.clear();
    this.simpleNameIndex.clear();
  }

  /**
   * Get the total number of indexed types.
   */
  get size(): number {
    return this.types.size;
  }

  /**
   * Get all indexed types.
   */
  getAllTypes(): JavaTypeInfo[] {
    return [...this.types.values()];
  }

  // ── Private helpers ───────────────────────────────────────────────

  private collectFields(
    fqn: string,
    fields: JavaFieldInfo[],
    visited: Set<string>
  ): void {
    if (visited.has(fqn)) return;
    visited.add(fqn);

    const type = this.types.get(fqn);
    if (!type) return;

    fields.push(...type.fields);

    // Walk superclass
    if (type.superClass && type.superClass !== "java.lang.Object") {
      this.collectFields(type.superClass, fields, visited);
    }

    // Walk interfaces (for default method fields / property accessors)
    for (const iface of type.interfaces) {
      this.collectFields(iface, fields, visited);
    }
  }

  private collectMethods(
    fqn: string,
    methods: JavaMethodInfo[],
    visited: Set<string>
  ): void {
    if (visited.has(fqn)) return;
    visited.add(fqn);

    const type = this.types.get(fqn);
    if (!type) return;

    methods.push(...type.methods);

    if (type.superClass && type.superClass !== "java.lang.Object") {
      this.collectMethods(type.superClass, methods, visited);
    }

    for (const iface of type.interfaces) {
      this.collectMethods(iface, methods, visited);
    }
  }
}
