/**
 * Import resolver for DRL files.
 *
 * Maps DRL import statements to resolved Java types using the Java type index.
 * Handles wildcard imports, static imports, and ambiguous type resolution.
 */

import * as AST from "../parser/ast";
import { JavaTypeInfo } from "../classpath/type-model";

/**
 * Result of resolving a DRL import statement.
 */
export interface ImportResolution {
  /** The original import target (FQN or wildcard) */
  target: string;
  /** Whether the import was successfully resolved */
  resolved: boolean;
  /** The resolved type (if single-type import and found) */
  type?: JavaTypeInfo;
  /** Error message if resolution failed */
  error?: string;
  /** Diagnostic code for the error */
  code?: string;
}

/**
 * Resolve a single import statement against the type index.
 */
export function resolveImport(
  imp: AST.ImportDeclaration,
  lookupType: (fqn: string) => JavaTypeInfo | undefined,
  lookupBySimpleName: (name: string) => string[]
): ImportResolution {
  // Skip function imports — they reference methods, not types
  if (imp.isFunction) {
    return { target: imp.target, resolved: true };
  }

  // Static imports — resolve the containing class
  if (imp.isStatic) {
    const lastDot = imp.target.lastIndexOf(".");
    if (lastDot === -1) {
      return {
        target: imp.target,
        resolved: false,
        error: `Invalid static import: ${imp.target}`,
        code: "DRL103",
      };
    }
    const classFqn = imp.target.slice(0, lastDot);
    const type = lookupType(classFqn);
    if (type) {
      return { target: imp.target, resolved: true, type };
    }
    // Static imports to unresolved classes are not errors (may be from JDK)
    return { target: imp.target, resolved: true };
  }

  // Wildcard imports: import com.example.model.*
  if (imp.target.endsWith(".*")) {
    // We can't validate wildcard imports without scanning all classes in the package
    // Just mark as resolved
    return { target: imp.target, resolved: true };
  }

  // Single-type import: import com.example.model.Person
  const type = lookupType(imp.target);
  if (type) {
    return { target: imp.target, resolved: true, type };
  }

  // Check if it's a JDK type we don't track (don't flag as error)
  if (isLikelyJdkImport(imp.target)) {
    return { target: imp.target, resolved: true };
  }

  return {
    target: imp.target,
    resolved: false,
    error: `Cannot resolve import \`${imp.target}\`. Class not found on classpath`,
    code: "DRL103",
  };
}

/**
 * Resolve a simple type name used in a DRL pattern against the file's imports.
 * Returns the FQN if resolved, undefined otherwise.
 */
export function resolveTypeName(
  simpleName: string,
  imports: AST.ImportDeclaration[],
  packageName: string | undefined,
  lookupType: (fqn: string) => JavaTypeInfo | undefined,
  lookupBySimpleName: (name: string) => string[]
): JavaTypeInfo | undefined {
  // 1. Check explicit imports
  for (const imp of imports) {
    if (imp.isFunction || imp.isStatic) continue;

    if (imp.target.endsWith("." + simpleName)) {
      const type = lookupType(imp.target);
      if (type) return type;
    }

    // Wildcard imports
    if (imp.target.endsWith(".*")) {
      const packagePrefix = imp.target.slice(0, -2);
      const fqn = `${packagePrefix}.${simpleName}`;
      const type = lookupType(fqn);
      if (type) return type;
    }
  }

  // 2. Check same package
  if (packageName) {
    const fqn = `${packageName}.${simpleName}`;
    const type = lookupType(fqn);
    if (type) return type;
  }

  // 3. Check java.lang (always implicitly imported in DRL)
  const javaLangFqn = `java.lang.${simpleName}`;
  const javaLangType = lookupType(javaLangFqn);
  if (javaLangType) return javaLangType;

  // 4. Try direct FQN lookup (if simpleName contains dots)
  if (simpleName.includes(".")) {
    return lookupType(simpleName);
  }

  return undefined;
}

/**
 * Find all types that could match a simple name, for "ambiguous type" diagnostics.
 */
export function findAmbiguousTypes(
  simpleName: string,
  imports: AST.ImportDeclaration[],
  lookupBySimpleName: (name: string) => string[]
): string[] {
  const candidates = lookupBySimpleName(simpleName);
  if (candidates.length <= 1) return [];

  // Filter to only candidates that are actually imported
  const importedPrefixes = imports
    .filter((imp) => imp.target.endsWith(".*"))
    .map((imp) => imp.target.slice(0, -2));

  const matching = candidates.filter((fqn) =>
    importedPrefixes.some((prefix) => fqn.startsWith(prefix + "."))
  );

  return matching.length > 1 ? matching : [];
}

/**
 * Check if an import target is likely a JDK class.
 * We don't index JDK classes, so these shouldn't be flagged as errors.
 */
function isLikelyJdkImport(target: string): boolean {
  const jdkPrefixes = [
    "java.", "javax.", "sun.", "com.sun.", "org.xml.", "org.w3c.",
    "jdk.", "netscape.",
  ];
  return jdkPrefixes.some((prefix) => target.startsWith(prefix));
}
