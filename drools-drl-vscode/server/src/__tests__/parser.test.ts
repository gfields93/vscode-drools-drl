import { describe, it, expect } from "vitest";
import { parse } from "../parser/parser";

describe("DRL Parser", () => {
  describe("package declaration", () => {
    it("parses a package declaration", () => {
      const ast = parse('package com.example.rules;');
      expect(ast.packageDecl?.name).toBe("com.example.rules");
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("import declarations", () => {
    it("parses simple imports", () => {
      const ast = parse('import com.example.model.Person;');
      expect(ast.imports).toHaveLength(1);
      expect(ast.imports[0].target).toBe("com.example.model.Person");
      expect(ast.imports[0].isFunction).toBe(false);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses function imports", () => {
      const ast = parse('import function com.example.Utils.helper;');
      expect(ast.imports).toHaveLength(1);
      expect(ast.imports[0].isFunction).toBe(true);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses wildcard imports", () => {
      const ast = parse('import com.example.model.*;');
      expect(ast.imports).toHaveLength(1);
      expect(ast.imports[0].target).toBe("com.example.model.*");
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("global declarations", () => {
    it("parses a global declaration", () => {
      const ast = parse('global java.util.List results;');
      expect(ast.globals).toHaveLength(1);
      expect(ast.globals[0].type).toBe("java.util.List");
      expect(ast.globals[0].name).toBe("results");
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("type declarations", () => {
    it("parses a simple type declaration", () => {
      const ast = parse(`
        declare Person
            name : String
            age : int
        end
      `);
      expect(ast.declares).toHaveLength(1);
      expect(ast.declares[0].name).toBe("Person");
      expect(ast.declares[0].fields).toHaveLength(2);
      expect(ast.declares[0].fields[0].name).toBe("name");
      expect(ast.declares[0].fields[0].type).toBe("String");
      expect(ast.declares[0].isTrait).toBe(false);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses a trait declaration", () => {
      const ast = parse(`
        declare trait Auditable
            createdBy : String
        end
      `);
      expect(ast.declares[0].isTrait).toBe(true);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses type with extends", () => {
      const ast = parse(`
        declare Employee extends Person
            role : String
        end
      `);
      expect(ast.declares[0].superType).toBe("Person");
      expect(ast.errors).toHaveLength(0);
    });

    it("parses metadata annotations", () => {
      const ast = parse(`
        declare Event
            @role(event)
            @timestamp(occurredAt)
            occurredAt : java.util.Date
        end
      `);
      expect(ast.declares[0].metadata.length).toBeGreaterThan(0);
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("rule declarations", () => {
    it("parses a basic rule", () => {
      const ast = parse(`
        rule "Simple Rule"
            when
                Person( age > 18 )
            then
                // action
            end
      `);
      expect(ast.rules).toHaveLength(1);
      expect(ast.rules[0].name).toBe("Simple Rule");
      expect(ast.rules[0].lhs.conditions).toHaveLength(1);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses a rule with attributes", () => {
      const ast = parse(`
        rule "Priority Rule"
            salience 100
            no-loop true
            agenda-group "validation"
            when
                Person( age > 18 )
            then
                // action
            end
      `);
      expect(ast.rules[0].attributes).toHaveLength(3);
      expect(ast.rules[0].attributes[0].name).toBe("salience");
      expect(ast.rules[0].attributes[0].value).toBe(100);
      expect(ast.rules[0].attributes[1].name).toBe("no-loop");
      expect(ast.rules[0].attributes[1].value).toBe(true);
      expect(ast.errors).toHaveLength(0);
    });

    it("parses a rule with extends", () => {
      const ast = parse(`
        rule "Child Rule" extends "Parent Rule"
            when
                Person( age > 21 )
            then
                // action
            end
      `);
      expect(ast.rules[0].parentRule).toBe("Parent Rule");
      expect(ast.errors).toHaveLength(0);
    });

    it("parses binding variables in LHS", () => {
      const ast = parse(`
        rule "Binding Test"
            when
                $p : Person( age > 18 )
            then
                update( $p );
            end
      `);
      const cond = ast.rules[0].lhs.conditions[0];
      expect(cond.kind).toBe("PatternCondition");
      if (cond.kind === "PatternCondition") {
        expect(cond.binding?.name).toBe("$p");
        expect(cond.factType).toBe("Person");
      }
      expect(ast.errors).toHaveLength(0);
    });

    it("parses not conditions", () => {
      const ast = parse(`
        rule "Not Test"
            when
                not Person( age < 18 )
            then
            end
      `);
      expect(ast.rules[0].lhs.conditions[0].kind).toBe("NotCondition");
      expect(ast.errors).toHaveLength(0);
    });

    it("parses exists conditions", () => {
      const ast = parse(`
        rule "Exists Test"
            when
                exists Person( role == "admin" )
            then
            end
      `);
      expect(ast.rules[0].lhs.conditions[0].kind).toBe("ExistsCondition");
      expect(ast.errors).toHaveLength(0);
    });

    it("parses RHS actions", () => {
      const ast = parse(`
        rule "Action Test"
            when
                $p : Person( age > 18 )
            then
                insert( new Address() );
                update( $p );
                delete( $p );
            end
      `);
      const actions = ast.rules[0].rhs.actions;
      expect(actions.length).toBeGreaterThanOrEqual(3);
      expect(actions.some(a => a.type === "insert")).toBe(true);
      expect(actions.some(a => a.type === "update")).toBe(true);
      expect(actions.some(a => a.type === "delete")).toBe(true);
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("query declarations", () => {
    it("parses a simple query", () => {
      const ast = parse(`
        query "Find Adults"
            Person( age >= 18 )
        end
      `);
      expect(ast.queries).toHaveLength(1);
      expect(ast.queries[0].name).toBe("Find Adults");
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("function declarations", () => {
    it("parses a function", () => {
      const ast = parse(`
        function String formatName(String first, String last) {
            return first + " " + last;
        }
      `);
      expect(ast.functions).toHaveLength(1);
      expect(ast.functions[0].name).toBe("formatName");
      expect(ast.functions[0].returnType).toBe("String");
      expect(ast.functions[0].parameters).toHaveLength(2);
      expect(ast.errors).toHaveLength(0);
    });
  });

  describe("error recovery", () => {
    it("recovers from missing end keyword", () => {
      const ast = parse(`
        rule "Missing End"
            when
                Person( age > 18 )
            then

        rule "Next Rule"
            when
            then
            end
      `);
      // Should still parse the second rule
      expect(ast.rules.length).toBeGreaterThanOrEqual(1);
      expect(ast.errors.length).toBeGreaterThan(0);
    });

    it("produces partial AST for malformed input", () => {
      const ast = parse("this is not valid drl at all");
      expect(ast).toBeDefined();
      expect(ast.kind).toBe("DrlFile");
    });
  });

  describe("fixture files", () => {
    const fs = require("fs");
    const path = require("path");
    const fixtureDir = path.join(__dirname, "..", "..", "..", "test-fixtures");

    const cleanFixtures = [
      "basic-rule.drl",
      "attributes.drl",
      "comments.drl",
      "type-declarations.drl",
    ];

    for (const fixture of cleanFixtures) {
      it(`parses ${fixture} without errors`, () => {
        const text = fs.readFileSync(path.join(fixtureDir, fixture), "utf8");
        const ast = parse(text);
        expect(ast.errors).toHaveLength(0);
      });
    }

    it("parses functions-queries.drl and extracts structure", () => {
      const text = fs.readFileSync(path.join(fixtureDir, "functions-queries.drl"), "utf8");
      const ast = parse(text);
      expect(ast.functions.length).toBeGreaterThan(0);
      expect(ast.queries.length).toBeGreaterThan(0);
    });
  });
});
