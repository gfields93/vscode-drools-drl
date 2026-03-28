import { describe, it, expect } from "vitest";
import {
  descriptorToTypeName,
  parseMethodDescriptor,
  getAccessorName,
  getMutatorName,
  isNumericType,
  isStringType,
  isBooleanType,
  isCollectionType,
} from "../classpath/type-model";

describe("Type Model", () => {
  describe("descriptorToTypeName", () => {
    it("converts primitive descriptors", () => {
      expect(descriptorToTypeName("I")).toBe("int");
      expect(descriptorToTypeName("J")).toBe("long");
      expect(descriptorToTypeName("D")).toBe("double");
      expect(descriptorToTypeName("F")).toBe("float");
      expect(descriptorToTypeName("Z")).toBe("boolean");
      expect(descriptorToTypeName("B")).toBe("byte");
      expect(descriptorToTypeName("C")).toBe("char");
      expect(descriptorToTypeName("S")).toBe("short");
      expect(descriptorToTypeName("V")).toBe("void");
    });

    it("converts object type descriptors", () => {
      expect(descriptorToTypeName("Ljava/lang/String;")).toBe("java.lang.String");
      expect(descriptorToTypeName("Lcom/example/Person;")).toBe("com.example.Person");
    });

    it("converts array descriptors", () => {
      expect(descriptorToTypeName("[I")).toBe("int[]");
      expect(descriptorToTypeName("[Ljava/lang/String;")).toBe("java.lang.String[]");
      expect(descriptorToTypeName("[[D")).toBe("double[][]");
    });
  });

  describe("parseMethodDescriptor", () => {
    it("parses void method with no params", () => {
      const result = parseMethodDescriptor("()V");
      expect(result.params).toEqual([]);
      expect(result.returnType).toBe("void");
    });

    it("parses method with primitive params", () => {
      const result = parseMethodDescriptor("(ID)Z");
      expect(result.params).toEqual(["int", "double"]);
      expect(result.returnType).toBe("boolean");
    });

    it("parses method with object params", () => {
      const result = parseMethodDescriptor("(Ljava/lang/String;I)Ljava/lang/Object;");
      expect(result.params).toEqual(["java.lang.String", "int"]);
      expect(result.returnType).toBe("java.lang.Object");
    });

    it("parses method with array params", () => {
      const result = parseMethodDescriptor("([I[Ljava/lang/String;)V");
      expect(result.params).toEqual(["int[]", "java.lang.String[]"]);
      expect(result.returnType).toBe("void");
    });
  });

  describe("accessor/mutator names", () => {
    it("generates getter names", () => {
      expect(getAccessorName("age", "int")).toBe("getAge");
      expect(getAccessorName("name", "java.lang.String")).toBe("getName");
    });

    it("generates 'is' prefix for booleans", () => {
      expect(getAccessorName("active", "boolean")).toBe("isActive");
      expect(getAccessorName("verified", "java.lang.Boolean")).toBe("isVerified");
    });

    it("generates setter names", () => {
      expect(getMutatorName("age")).toBe("setAge");
      expect(getMutatorName("name")).toBe("setName");
    });
  });

  describe("type classification", () => {
    it("identifies numeric types", () => {
      expect(isNumericType("int")).toBe(true);
      expect(isNumericType("java.lang.Integer")).toBe(true);
      expect(isNumericType("double")).toBe(true);
      expect(isNumericType("java.math.BigDecimal")).toBe(true);
      expect(isNumericType("java.lang.String")).toBe(false);
    });

    it("identifies string types", () => {
      expect(isStringType("java.lang.String")).toBe(true);
      expect(isStringType("String")).toBe(true);
      expect(isStringType("int")).toBe(false);
    });

    it("identifies boolean types", () => {
      expect(isBooleanType("boolean")).toBe(true);
      expect(isBooleanType("java.lang.Boolean")).toBe(true);
      expect(isBooleanType("int")).toBe(false);
    });

    it("identifies collection types", () => {
      expect(isCollectionType("java.util.List")).toBe(true);
      expect(isCollectionType("java.util.ArrayList")).toBe(true);
      expect(isCollectionType("int[]")).toBe(true);
      expect(isCollectionType("java.lang.String")).toBe(false);
    });
  });
});
