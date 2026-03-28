import { describe, it, expect, beforeEach } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DrlDocument } from "../model/drl-document";
import { DrlIndex } from "../workspace/drl-index";
import { JavaTypeIndex } from "../workspace/java-type-index";
import { WorkspaceIndex } from "../workspace/workspace-index";
import { getDefinition } from "../providers/definition";
import { getReferences } from "../providers/references";
import { prepareRename, getRename } from "../providers/rename";
import { getCodeActions } from "../providers/code-actions";
import { JavaTypeInfo } from "../classpath/type-model";
import { Location, CodeActionParams, Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";

// Helper to create a TextDocument + DrlDocument pair
function makeDocPair(uri: string, text: string) {
  const textDoc = TextDocument.create(uri, "drools", 1, text);
  const drlDoc = new DrlDocument(uri, text);
  return { textDoc, drlDoc };
}

function makeType(fqn: string): JavaTypeInfo {
  return {
    fullyQualifiedName: fqn,
    simpleName: fqn.includes(".") ? fqn.slice(fqn.lastIndexOf(".") + 1) : fqn,
    kind: "class",
    interfaces: [],
    fields: [],
    methods: [],
    isAbstract: false,
    source: "java-source",
    sourceUri: `/path/to/${fqn.replace(/\./g, "/")}.java`,
  };
}

describe("Go-to-Definition", () => {
  let workspaceIndex: WorkspaceIndex;

  beforeEach(() => {
    workspaceIndex = new WorkspaceIndex();
  });

  it("navigates from fact type to DRL declare block", () => {
    const text = `
declare Address
    street : String
    city : String
end

rule "Test"
    when
        Address( street == "Main" )
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    // Position cursor on "Address" in the pattern (line 8)
    const result = getDefinition(textDoc, { line: 8, character: 10 }, drlDoc, workspaceIndex);

    expect(result).not.toBeNull();
    const loc = result as Location;
    expect(loc.uri).toBe("file:///test.drl");
    // Should point to the declare block's name range
    expect(loc.range.start.line).toBe(1);
  });

  it("navigates from binding variable in RHS to LHS declaration", () => {
    const text = `
rule "Test"
    when
        $person : Person( age > 18 )
    then
        modify( $person ) { setVerified( true ) };
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);

    // Position cursor on "$person" in the then block (line 5)
    const result = getDefinition(textDoc, { line: 5, character: 18 }, drlDoc, workspaceIndex);

    expect(result).not.toBeNull();
    const loc = result as Location;
    expect(loc.uri).toBe("file:///test.drl");
    // Should point to the binding declaration on line 3
    expect(loc.range.start.line).toBe(3);
  });

  it("navigates from fact type to Java source file", () => {
    const text = `
import com.example.model.Person;

rule "Test"
    when
        Person( age > 18 )
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.javaTypeIndex.addType(makeType("com.example.model.Person"));
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    // Position cursor on "Person" in the pattern (line 5)
    const result = getDefinition(textDoc, { line: 5, character: 10 }, drlDoc, workspaceIndex);

    expect(result).not.toBeNull();
    const loc = result as Location;
    expect(loc.uri).toContain("Person.java");
  });

  it("navigates from global variable to its declaration", () => {
    const text = `
global java.util.List results;

rule "Test"
    when
        Person()
    then
        results.add("done");
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    // Position cursor on "results" in the then block (line 7)
    const result = getDefinition(textDoc, { line: 7, character: 10 }, drlDoc, workspaceIndex);

    expect(result).not.toBeNull();
    const loc = result as Location;
    expect(loc.uri).toBe("file:///test.drl");
    expect(loc.range.start.line).toBe(1); // global declaration line
  });
});

describe("Find References", () => {
  let workspaceIndex: WorkspaceIndex;

  beforeEach(() => {
    workspaceIndex = new WorkspaceIndex();
  });

  it("finds all rules using a fact type", () => {
    const text = `
import com.example.model.Person;

rule "Rule A"
    when
        Person( age > 18 )
    then
end

rule "Rule B"
    when
        Person( name == "John" )
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    // Position cursor on "Person" (line 5)
    const refs = getReferences(textDoc, { line: 5, character: 10 }, drlDoc, workspaceIndex, true);

    // Should find references in both rules plus the import
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("finds binding variable references within a rule", () => {
    const text = `
rule "Test"
    when
        $p : Person( age > 18 )
    then
        modify( $p ) { setVerified( true ) };
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);

    // Position cursor on "$p" (line 3)
    const refs = getReferences(textDoc, { line: 3, character: 10 }, drlDoc, workspaceIndex, true);

    // Should find at least the declaration and one RHS usage
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("finds cross-file fact type references", () => {
    const text1 = `
rule "Rule A"
    when
        Order( total > 100 )
    then
end
`;
    const text2 = `
rule "Rule B"
    when
        Order( status == "NEW" )
    then
end
`;
    const doc1 = new DrlDocument("file:///a.drl", text1);
    const doc2 = new DrlDocument("file:///b.drl", text2);
    workspaceIndex.drlIndex.updateDocument("file:///a.drl", doc1);
    workspaceIndex.drlIndex.updateDocument("file:///b.drl", doc2);

    const textDoc1 = TextDocument.create("file:///a.drl", "drools", 1, text1);

    // Position cursor on "Order" in file a (line 3)
    const refs = getReferences(textDoc1, { line: 3, character: 10 }, doc1, workspaceIndex, true);

    // Should find references in both files
    expect(refs.length).toBe(2);
    const uris = refs.map((r) => r.uri);
    expect(uris).toContain("file:///a.drl");
    expect(uris).toContain("file:///b.drl");
  });
});

describe("Rename", () => {
  let workspaceIndex: WorkspaceIndex;

  beforeEach(() => {
    workspaceIndex = new WorkspaceIndex();
  });

  it("prepares rename for a declared type", () => {
    const text = `
declare Address
    street : String
end

rule "Test"
    when
        Address( street == "Main" )
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    const result = prepareRename(textDoc, { line: 1, character: 10 }, drlDoc, workspaceIndex);

    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe("Address");
  });

  it("renames a declared type across patterns and declaration", () => {
    const text = `
declare Address
    street : String
end

rule "Test"
    when
        Address( street == "Main" )
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    const edit = getRename(
      textDoc,
      { line: 1, character: 10 },
      "Location",
      drlDoc,
      workspaceIndex
    );

    expect(edit).not.toBeNull();
    const changes = edit!.changes!["file:///test.drl"];
    expect(changes).toBeDefined();
    expect(changes.length).toBeGreaterThanOrEqual(2); // Declaration + pattern
  });

  it("renames binding variable within a rule", () => {
    const text = `
rule "Test"
    when
        $p : Person( age > 18 )
    then
        modify( $p ) { setVerified( true ) };
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);
    workspaceIndex.drlIndex.updateDocument("file:///test.drl", drlDoc);

    const edit = getRename(
      textDoc,
      { line: 3, character: 10 },
      "$person",
      drlDoc,
      workspaceIndex
    );

    expect(edit).not.toBeNull();
    const changes = edit!.changes!["file:///test.drl"];
    expect(changes).toBeDefined();
    expect(changes.length).toBeGreaterThanOrEqual(2); // Declaration + usage
  });
});

describe("Code Actions", () => {
  let workspaceIndex: WorkspaceIndex;

  beforeEach(() => {
    workspaceIndex = new WorkspaceIndex();
  });

  it("suggests removing unused import", () => {
    const text = `
import com.example.model.Person;

rule "Test"
    when
    then
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);

    const diagnostic: Diagnostic = {
      range: Range.create(1, 0, 1, 35),
      severity: DiagnosticSeverity.Warning,
      message: "Import `com.example.model.Person` is not used by any rule",
      source: "drools",
      code: "DRL104",
    };

    const params: CodeActionParams = {
      textDocument: { uri: "file:///test.drl" },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    };

    const actions = getCodeActions(textDoc, params, drlDoc, workspaceIndex);

    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].title).toBe("Remove unused import");
    expect(actions[0].edit?.changes?.["file:///test.drl"]).toBeDefined();
  });

  it("suggests replacing retract with delete", () => {
    const text = `
rule "Test"
    when
        $p : Person()
    then
        retract( $p );
end
`;
    const { textDoc, drlDoc } = makeDocPair("file:///test.drl", text);

    const diagnostic: Diagnostic = {
      range: Range.create(5, 8, 5, 22),
      severity: DiagnosticSeverity.Warning,
      message: "`retract` is deprecated; use `delete` instead",
      source: "drools",
      code: "DRL013",
    };

    const params: CodeActionParams = {
      textDocument: { uri: "file:///test.drl" },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    };

    const actions = getCodeActions(textDoc, params, drlDoc, workspaceIndex);

    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].title).toBe("Replace `retract` with `delete`");
  });
});
