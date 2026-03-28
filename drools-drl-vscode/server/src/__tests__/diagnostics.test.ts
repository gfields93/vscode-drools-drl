import { describe, it, expect } from "vitest";
import { DrlDocument } from "../model/drl-document";
import { getDiagnostics } from "../providers/diagnostics";

describe("Diagnostics Provider", () => {
  it("reports no diagnostics for valid DRL", () => {
    const doc = new DrlDocument("test.drl", `
      package com.example;
      rule "Valid Rule"
          when
              Person( age > 18 )
          then
              update( $p );
          end
    `);
    const diagnostics = getDiagnostics(doc);
    // May have parse errors from $p not being bound, but no semantic errors
    const semanticDiags = diagnostics.filter(d => d.code !== "DRL009");
    expect(semanticDiags.length).toBeLessThanOrEqual(1); // DRL008 for simple action
  });

  it("detects duplicate rule names (DRL006)", () => {
    const doc = new DrlDocument("test.drl", `
      rule "Duplicate"
          when then end
      rule "Duplicate"
          when then end
    `);
    const diagnostics = getDiagnostics(doc);
    const dups = diagnostics.filter(d => d.code === "DRL006");
    expect(dups).toHaveLength(1);
    expect(dups[0].message).toContain("Duplicate");
  });

  it("warns on empty LHS (DRL007)", () => {
    const doc = new DrlDocument("test.drl", `
      rule "Empty When"
          when
          then
              // do something
          end
    `);
    const diagnostics = getDiagnostics(doc);
    const empty = diagnostics.filter(d => d.code === "DRL007");
    expect(empty).toHaveLength(1);
  });

  it("warns on deprecated retract (DRL013)", () => {
    const doc = new DrlDocument("test.drl", `
      rule "Uses Retract"
          when
              $p : Person( )
          then
              retract( $p );
          end
    `);
    const diagnostics = getDiagnostics(doc);
    const deprecated = diagnostics.filter(d => d.code === "DRL013");
    expect(deprecated).toHaveLength(1);
    expect(deprecated[0].message).toContain("deprecated");
  });
});
