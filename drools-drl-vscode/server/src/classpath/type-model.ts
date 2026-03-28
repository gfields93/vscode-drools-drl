/**
 * Java type information model for classpath integration.
 *
 * These interfaces represent the metadata extracted from Java classes
 * (via .class file parsing, .java source parsing, or DRL declare blocks)
 * and are used by the type index for completion, validation, and navigation.
 */

import { Range } from "../parser/ast";

export interface JavaTypeInfo {
  /** Fully-qualified class name, e.g. "com.example.model.Person" */
  fullyQualifiedName: string;
  /** Simple class name, e.g. "Person" */
  simpleName: string;
  /** Kind of Java type */
  kind: "class" | "interface" | "enum" | "annotation";
  /** FQN of the superclass, if any */
  superClass?: string;
  /** FQNs of implemented interfaces */
  interfaces: string[];
  /** Fields declared on this type */
  fields: JavaFieldInfo[];
  /** Methods declared on this type */
  methods: JavaMethodInfo[];
  /** Whether the class is abstract */
  isAbstract: boolean;
  /** Where this type info came from */
  source: "class-file" | "java-source" | "drl-declare";
  /** File path for go-to-definition navigation */
  sourceUri?: string;
}

export interface JavaFieldInfo {
  /** Field name, e.g. "age" */
  name: string;
  /** Field type, e.g. "int", "java.lang.String" */
  type: string;
  /** Getter method name, e.g. "getAge" or "isActive" for booleans */
  accessorName: string;
  /** Setter method name, e.g. "setAge" */
  mutatorName: string;
  /** True if no setter is available */
  isReadOnly: boolean;
  /** Source location if from a Java source file */
  range?: Range;
}

export interface JavaMethodInfo {
  /** Method name */
  name: string;
  /** Return type (FQN or primitive) */
  returnType: string;
  /** Method parameters */
  parameters: { name: string; type: string }[];
  /** Whether the method is static */
  isStatic: boolean;
  /** Source location if from a Java source file */
  range?: Range;
}

/**
 * Derive the conventional JavaBean accessor name for a field.
 */
export function getAccessorName(fieldName: string, fieldType: string): string {
  const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  const isBool = fieldType === "boolean" || fieldType === "java.lang.Boolean";
  return isBool ? `is${capitalized}` : `get${capitalized}`;
}

/**
 * Derive the conventional JavaBean mutator name for a field.
 */
export function getMutatorName(fieldName: string): string {
  const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return `set${capitalized}`;
}

/**
 * Map a JVM type descriptor to a human-readable type name.
 * E.g. "I" -> "int", "Ljava/lang/String;" -> "java.lang.String"
 */
export function descriptorToTypeName(descriptor: string): string {
  switch (descriptor.charAt(0)) {
    case "B": return "byte";
    case "C": return "char";
    case "D": return "double";
    case "F": return "float";
    case "I": return "int";
    case "J": return "long";
    case "S": return "short";
    case "Z": return "boolean";
    case "V": return "void";
    case "L": {
      // Object type: Ljava/lang/String; -> java.lang.String
      const end = descriptor.indexOf(";");
      if (end === -1) return descriptor.slice(1).replace(/\//g, ".");
      return descriptor.slice(1, end).replace(/\//g, ".");
    }
    case "[": {
      // Array type: [I -> int[], [Ljava/lang/String; -> java.lang.String[]
      return descriptorToTypeName(descriptor.slice(1)) + "[]";
    }
    default:
      return descriptor;
  }
}

/**
 * Parse a JVM method descriptor to extract parameter types and return type.
 * E.g. "(ILjava/lang/String;)V" -> { params: ["int", "java.lang.String"], returnType: "void" }
 */
export function parseMethodDescriptor(descriptor: string): {
  params: string[];
  returnType: string;
} {
  const params: string[] = [];
  let i = 1; // skip opening '('

  while (i < descriptor.length && descriptor.charAt(i) !== ")") {
    const ch = descriptor.charAt(i);
    if ("BCDFIJSZV".includes(ch)) {
      params.push(descriptorToTypeName(ch));
      i++;
    } else if (ch === "L") {
      const end = descriptor.indexOf(";", i);
      params.push(descriptorToTypeName(descriptor.slice(i, end + 1)));
      i = end + 1;
    } else if (ch === "[") {
      // Array — find the element type
      let arrayPrefix = "[";
      i++;
      while (i < descriptor.length && descriptor.charAt(i) === "[") {
        arrayPrefix += "[";
        i++;
      }
      const elemCh = descriptor.charAt(i);
      if (elemCh === "L") {
        const end = descriptor.indexOf(";", i);
        const elemDesc = descriptor.slice(i, end + 1);
        params.push(descriptorToTypeName(arrayPrefix + elemDesc));
        i = end + 1;
      } else {
        params.push(descriptorToTypeName(arrayPrefix + elemCh));
        i++;
      }
    } else {
      i++;
    }
  }

  // Return type comes after ')'
  const returnDesc = descriptor.slice(i + 1);
  const returnType = descriptorToTypeName(returnDesc);

  return { params, returnType };
}

/**
 * Check if a type is numeric (for operator validation in constraints).
 */
export function isNumericType(typeName: string): boolean {
  const numericTypes = new Set([
    "byte", "short", "int", "long", "float", "double",
    "java.lang.Byte", "java.lang.Short", "java.lang.Integer",
    "java.lang.Long", "java.lang.Float", "java.lang.Double",
    "java.math.BigDecimal", "java.math.BigInteger",
  ]);
  return numericTypes.has(typeName);
}

/**
 * Check if a type is a string type.
 */
export function isStringType(typeName: string): boolean {
  return typeName === "java.lang.String" || typeName === "String";
}

/**
 * Check if a type is a boolean type.
 */
export function isBooleanType(typeName: string): boolean {
  return typeName === "boolean" || typeName === "java.lang.Boolean";
}

/**
 * Check if a type is a collection type.
 */
export function isCollectionType(typeName: string): boolean {
  const collectionTypes = new Set([
    "java.util.Collection", "java.util.List", "java.util.Set",
    "java.util.ArrayList", "java.util.LinkedList", "java.util.HashSet",
    "java.util.TreeSet", "java.util.Queue", "java.util.Deque",
  ]);
  return collectionTypes.has(typeName) || typeName.endsWith("[]");
}
