import { describe, it, expect } from "vitest";
import { DrlIndex } from "../workspace/drl-index";
import { JavaTypeIndex } from "../workspace/java-type-index";
import { DrlDocument } from "../model/drl-document";
import { JavaTypeInfo, JavaFieldInfo } from "../classpath/type-model";

describe("DrlIndex", () => {
  function createDoc(uri: string, text: string): DrlDocument {
    return new DrlDocument(uri, text);
  }

  it("indexes rules from multiple documents", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///a.drl",
      createDoc("file:///a.drl", `
        package com.example;
        rule "Rule A"
          when
            Person()
          then
        end
      `)
    );

    index.updateDocument(
      "file:///b.drl",
      createDoc("file:///b.drl", `
        package com.example;
        rule "Rule B"
          when
            Order()
          then
        end
      `)
    );

    expect(index.documentCount).toBe(2);
    expect(index.findRule("Rule A")).toBeDefined();
    expect(index.findRule("Rule B")).toBeDefined();
    expect(index.findRule("Rule C")).toBeUndefined();
  });

  it("detects duplicate rule names across files", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///a.drl",
      createDoc("file:///a.drl", `
        rule "Duplicate"
          when then
        end
      `)
    );

    index.updateDocument(
      "file:///b.drl",
      createDoc("file:///b.drl", `
        rule "Duplicate"
          when then
        end
      `)
    );

    const dups = index.getDuplicateRuleNames();
    expect(dups).toHaveLength(1);
    expect(dups[0].name).toBe("Duplicate");
    expect(dups[0].locations).toHaveLength(2);
  });

  it("removes document entries on removal", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///a.drl",
      createDoc("file:///a.drl", `
        rule "Rule A"
          when then
        end
      `)
    );

    expect(index.findRule("Rule A")).toBeDefined();

    index.removeDocument("file:///a.drl");
    expect(index.findRule("Rule A")).toBeUndefined();
    expect(index.documentCount).toBe(0);
  });

  it("updates document entries on re-indexing", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///a.drl",
      createDoc("file:///a.drl", `
        rule "OldRule"
          when then
        end
      `)
    );

    expect(index.findRule("OldRule")).toBeDefined();

    // Re-index with different content
    index.updateDocument(
      "file:///a.drl",
      createDoc("file:///a.drl", `
        rule "NewRule"
          when then
        end
      `)
    );

    expect(index.findRule("OldRule")).toBeUndefined();
    expect(index.findRule("NewRule")).toBeDefined();
  });

  it("indexes declared types", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///types.drl",
      createDoc("file:///types.drl", `
        declare Address
          street : String
          city : String
        end
      `)
    );

    const type = index.findDeclaredType("Address");
    expect(type).toBeDefined();
    expect(type!.decl.fields).toHaveLength(2);
  });

  it("finds rules using a fact type", () => {
    const index = new DrlIndex();

    index.updateDocument(
      "file:///rules.drl",
      createDoc("file:///rules.drl", `
        rule "PersonRule"
          when
            Person( age > 18 )
          then
        end

        rule "OrderRule"
          when
            Order( total > 100 )
          then
        end
      `)
    );

    const personRules = index.findAllRulesUsingFactType("Person");
    expect(personRules).toHaveLength(1);
    expect(personRules[0].rule.name).toBe("PersonRule");

    const orderRules = index.findAllRulesUsingFactType("Order");
    expect(orderRules).toHaveLength(1);
  });
});

describe("JavaTypeIndex", () => {
  function makeType(fqn: string, fields: Partial<JavaFieldInfo>[] = []): JavaTypeInfo {
    return {
      fullyQualifiedName: fqn,
      simpleName: fqn.includes(".") ? fqn.slice(fqn.lastIndexOf(".") + 1) : fqn,
      kind: "class",
      interfaces: [],
      fields: fields.map((f) => ({
        name: f.name || "",
        type: f.type || "java.lang.String",
        accessorName: f.accessorName || `get${(f.name || "").charAt(0).toUpperCase()}${(f.name || "").slice(1)}`,
        mutatorName: f.mutatorName || `set${(f.name || "").charAt(0).toUpperCase()}${(f.name || "").slice(1)}`,
        isReadOnly: f.isReadOnly ?? false,
      })),
      methods: [],
      isAbstract: false,
      source: "java-source",
    };
  }

  it("resolves types by FQN", () => {
    const index = new JavaTypeIndex();
    index.addType(makeType("com.example.Person"));

    expect(index.resolveType("com.example.Person")).toBeDefined();
    expect(index.resolveType("com.example.Order")).toBeUndefined();
  });

  it("resolves types by simple name", () => {
    const index = new JavaTypeIndex();
    index.addType(makeType("com.example.Person"));
    index.addType(makeType("com.other.Person"));

    const matches = index.resolveBySimpleName("Person");
    expect(matches).toHaveLength(2);
    expect(matches).toContain("com.example.Person");
    expect(matches).toContain("com.other.Person");
  });

  it("collects inherited fields", () => {
    const index = new JavaTypeIndex();
    index.addType({
      ...makeType("com.example.Base", [{ name: "id", type: "int" }]),
    });
    index.addType({
      ...makeType("com.example.Child", [{ name: "name", type: "java.lang.String" }]),
      superClass: "com.example.Base",
    });

    const fields = index.getFieldsForType("com.example.Child");
    expect(fields).toHaveLength(2);
    const fieldNames = fields.map((f) => f.name);
    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("id");
  });

  it("invalidates types by source URI", () => {
    const index = new JavaTypeIndex();
    const type = makeType("com.example.Person");
    type.sourceUri = "/path/to/Person.java";
    index.addType(type);

    expect(index.size).toBe(1);
    index.invalidateBySource("/path/to/Person.java");
    expect(index.size).toBe(0);
  });
});
