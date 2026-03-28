/**
 * Lightweight regex-based Java source file parser.
 *
 * Extracts type metadata (class name, fields, methods, superclass, interfaces)
 * from .java source files without requiring a full Java parser. Handles standard
 * JavaBean POJOs that Drools typically uses as fact models.
 */

import {
  JavaTypeInfo,
  JavaFieldInfo,
  JavaMethodInfo,
  getAccessorName,
  getMutatorName,
} from "./type-model";

/**
 * Parse a Java source file and extract type information.
 * Returns undefined if the file cannot be meaningfully parsed.
 */
export function parseJavaSource(
  content: string,
  filePath: string
): JavaTypeInfo | undefined {
  const packageName = extractPackage(content);
  const typeMatch = extractTypeDeclaration(content);
  if (!typeMatch) return undefined;

  const { name, kind, superClass, interfaces, isAbstract, bodyStart } =
    typeMatch;

  const fqn = packageName ? `${packageName}.${name}` : name;
  const body = extractClassBody(content, bodyStart);

  const fields = extractFields(body);
  const methods = extractMethods(body);

  // Determine read-only fields by checking for setters
  const setterNames = new Set(
    methods.filter((m) => m.name.startsWith("set")).map((m) => m.name)
  );

  const javaFields: JavaFieldInfo[] = fields.map((f) => {
    const accessorName = getAccessorName(f.name, f.type);
    const mutatorName = getMutatorName(f.name);
    return {
      name: f.name,
      type: f.type,
      accessorName,
      mutatorName,
      isReadOnly: !setterNames.has(mutatorName),
    };
  });

  // Also infer fields from getter methods that don't have a corresponding field
  const fieldNames = new Set(fields.map((f) => f.name));
  for (const method of methods) {
    const inferredField = inferFieldFromGetter(method);
    if (inferredField && !fieldNames.has(inferredField.name)) {
      fieldNames.add(inferredField.name);
      const mutatorName = getMutatorName(inferredField.name);
      javaFields.push({
        name: inferredField.name,
        type: inferredField.type,
        accessorName: method.name,
        mutatorName,
        isReadOnly: !setterNames.has(mutatorName),
      });
    }
  }

  return {
    fullyQualifiedName: fqn,
    simpleName: name,
    kind,
    superClass: superClass
      ? resolveTypeName(superClass, packageName)
      : undefined,
    interfaces: interfaces.map((i) => resolveTypeName(i, packageName)),
    fields: javaFields,
    methods: methods.map((m) => ({
      name: m.name,
      returnType: m.returnType,
      parameters: m.parameters,
      isStatic: m.isStatic,
    })),
    isAbstract,
    source: "java-source",
    sourceUri: filePath,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────

function extractPackage(content: string): string | undefined {
  const match = content.match(/^\s*package\s+([\w.]+)\s*;/m);
  return match ? match[1] : undefined;
}

interface TypeDeclMatch {
  name: string;
  kind: JavaTypeInfo["kind"];
  superClass?: string;
  interfaces: string[];
  isAbstract: boolean;
  bodyStart: number;
}

function extractTypeDeclaration(content: string): TypeDeclMatch | undefined {
  // Match class, interface, enum, or annotation type declarations
  // Handles: public abstract class Foo extends Bar implements Baz, Qux {
  const pattern =
    /(?:^|\n)\s*(?:(?:public|protected|private|static|final|abstract)\s+)*(class|interface|enum|@interface)\s+(\w+)(?:\s*<[^>]*>)?(?:\s+extends\s+([\w.,<>\s]+?))?(?:\s+implements\s+([\w.,<>\s]+?))?\s*\{/;

  const match = content.match(pattern);
  if (!match) return undefined;

  const [fullMatch, kindStr, name, extendsClause, implementsClause] = match;
  const bodyStart = content.indexOf(fullMatch) + fullMatch.length;

  const kind = kindStr === "@interface" ? "annotation" : (kindStr as JavaTypeInfo["kind"]);
  const isAbstract = /\babstract\b/.test(fullMatch);

  const superClass = extendsClause
    ? extendsClause.split(",")[0].trim().replace(/<.*>/, "")
    : undefined;

  const interfaces = implementsClause
    ? implementsClause
        .split(",")
        .map((s) => s.trim().replace(/<.*>/, ""))
        .filter((s) => s.length > 0)
    : [];

  return { name, kind, superClass, interfaces, isAbstract, bodyStart };
}

/**
 * Extract the class body by matching braces from bodyStart.
 */
function extractClassBody(content: string, bodyStart: number): string {
  let depth = 1;
  let i = bodyStart;
  while (i < content.length && depth > 0) {
    const ch = content.charAt(i);
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return content.slice(bodyStart, i - 1);
}

interface RawField {
  name: string;
  type: string;
}

/**
 * Extract field declarations from the class body.
 * Matches: [modifiers] Type fieldName [= value];
 */
function extractFields(body: string): RawField[] {
  const fields: RawField[] = [];
  // Remove method bodies to avoid matching local variables
  const cleaned = removeMethodBodies(body);

  const fieldPattern =
    /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?([\w.<>,\[\]]+)\s+(\w+)\s*(?:=|;)/g;

  let match;
  while ((match = fieldPattern.exec(cleaned)) !== null) {
    const type = match[1].replace(/<.*>/, "");
    const name = match[2];
    // Skip static fields (usually constants, not fact model properties)
    if (/\bstatic\b/.test(match[0])) continue;
    fields.push({ name, type });
  }

  return fields;
}

/**
 * Remove method bodies from the class body to avoid matching local variables.
 */
function removeMethodBodies(body: string): string {
  let result = "";
  let depth = 0;
  let inMethod = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);
    if (ch === "{") {
      depth++;
      if (depth === 1) {
        inMethod = true;
        continue;
      }
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        inMethod = false;
        continue;
      }
    }
    if (!inMethod) {
      result += ch;
    }
  }
  return result;
}

interface RawMethod {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  isStatic: boolean;
}

/**
 * Extract method signatures from the class body.
 */
function extractMethods(body: string): RawMethod[] {
  const methods: RawMethod[] = [];

  const methodPattern =
    /(?:(?:public|protected|private|static|final|synchronized|abstract)\s+)*([\w.<>,\[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;

  let match;
  while ((match = methodPattern.exec(body)) !== null) {
    const returnType = match[1].replace(/<.*>/, "");
    const name = match[2];
    const paramsStr = match[3].trim();
    const isStatic = /\bstatic\b/.test(match[0]);

    // Skip constructors (return type = class name pattern)
    if (returnType === name) continue;

    const parameters = paramsStr.length > 0
      ? paramsStr.split(",").map((p) => {
          const parts = p.trim().split(/\s+/);
          const paramType = parts.length >= 2 ? parts[parts.length - 2].replace(/<.*>/, "") : "Object";
          const paramName = parts[parts.length - 1] || "arg";
          return { name: paramName, type: paramType };
        })
      : [];

    methods.push({ name, returnType, parameters, isStatic });
  }

  return methods;
}

/**
 * Infer a field from a getter method.
 * E.g. getName() -> { name: "name", type: "String" }
 */
function inferFieldFromGetter(
  method: RawMethod
): { name: string; type: string } | undefined {
  if (method.isStatic || method.parameters.length > 0) return undefined;
  if (method.returnType === "void") return undefined;

  const name = method.name;
  let fieldName: string | undefined;

  if (name.startsWith("get") && name.length > 3) {
    fieldName = name.charAt(3).toLowerCase() + name.slice(4);
  } else if (name.startsWith("is") && name.length > 2) {
    fieldName = name.charAt(2).toLowerCase() + name.slice(3);
  }

  if (!fieldName) return undefined;

  return { name: fieldName, type: method.returnType };
}

/**
 * Resolve a simple type name using the package context.
 * If the type already contains a dot, it's assumed to be fully qualified.
 */
function resolveTypeName(
  typeName: string,
  packageName: string | undefined
): string {
  if (typeName.includes(".")) return typeName;
  // Common java.lang types
  const javaLangTypes = new Set([
    "Object", "String", "Integer", "Long", "Double", "Float",
    "Boolean", "Byte", "Short", "Character", "Number", "Comparable",
    "Iterable", "Cloneable", "Serializable",
  ]);
  if (javaLangTypes.has(typeName)) return `java.lang.${typeName}`;
  return packageName ? `${packageName}.${typeName}` : typeName;
}
