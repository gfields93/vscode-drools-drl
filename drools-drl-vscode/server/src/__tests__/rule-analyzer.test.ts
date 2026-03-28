import { describe, it, expect } from "vitest";
import { analyzeRules, getRuleDependencies } from "../analysis/rule-analyzer";
import { DrlIndex } from "../workspace/drl-index";
import { DrlDocument } from "../model/drl-document";

function indexDoc(index: DrlIndex, uri: string, text: string): void {
  const doc = new DrlDocument(uri, text);
  index.updateDocument(uri, doc);
}

describe("Rule Analyzer", () => {
  describe("Conflict Detection", () => {
    it("detects conflicting modifications on the same field", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "Approve"
            when
                Person( age > 18 )
            then
                modify( $p ) { setStatus("APPROVED") };
        end

        rule "Reject"
            when
                Person( age > 21 )
            then
                modify( $p ) { setStatus("REJECTED") };
        end
      `);

      const result = analyzeRules(index);

      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      const conflict = result.conflicts[0];
      expect(conflict.factType).toBe("Person");
      expect(conflict.field).toBe("status");
      expect(conflict.valueA).not.toBe(conflict.valueB);
    });

    it("does not flag rules with different fact types as conflicts", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "PersonRule"
            when
                Person( age > 18 )
            then
                modify( $p ) { setStatus("ACTIVE") };
        end

        rule "OrderRule"
            when
                Order( total > 100 )
            then
                modify( $o ) { setStatus("SHIPPED") };
        end
      `);

      const result = analyzeRules(index);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe("Shadowing Detection", () => {
    it("detects higher salience rule shadowing lower salience", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "HighPriority"
            salience 100
            when
                Person( age > 18 )
            then
        end

        rule "LowPriority"
            salience 10
            when
                Person( age > 18 )
            then
        end
      `);

      const result = analyzeRules(index);

      expect(result.shadows.length).toBeGreaterThanOrEqual(1);
      expect(result.shadows[0].shadowedBy.name).toBe("HighPriority");
      expect(result.shadows[0].shadowed.name).toBe("LowPriority");
    });

    it("does not flag rules in different agenda groups", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "GroupA Rule"
            agenda-group "groupA"
            salience 100
            when
                Person( age > 18 )
            then
        end

        rule "GroupB Rule"
            agenda-group "groupB"
            salience 10
            when
                Person( age > 18 )
            then
        end
      `);

      const result = analyzeRules(index);
      expect(result.shadows).toHaveLength(0);
    });
  });

  describe("Circular Dependency Detection", () => {
    it("detects a simple circular dependency", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "Rule A"
            when
                Person()
            then
                insert( new Order() );
        end

        rule "Rule B"
            when
                Order()
            then
                insert( new Person() );
        end
      `);

      const result = analyzeRules(index);

      expect(result.circularDependencies.length).toBeGreaterThanOrEqual(1);
      const cycle = result.circularDependencies[0];
      expect(cycle.reason).toContain("Circular dependency");
    });

    it("does not flag non-circular rules", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "Rule A"
            when
                Person()
            then
                insert( new Order() );
        end

        rule "Rule B"
            when
                Order()
            then
                insert( new Alert() );
        end
      `);

      const result = analyzeRules(index);
      expect(result.circularDependencies).toHaveLength(0);
    });
  });

  describe("Dependency Graph", () => {
    it("builds dependency info for a single rule", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "Process Order"
            when
                Order( status == "NEW" )
            then
                insert( new Alert("order_processed") );
        end
      `);

      const dep = getRuleDependencies("Process Order", index);

      expect(dep).toBeDefined();
      expect(dep!.triggeredBy).toContain("Order");
      expect(dep!.triggers).toContain("Alert");
    });

    it("returns undefined for unknown rule", () => {
      const index = new DrlIndex();
      expect(getRuleDependencies("NonExistent", index)).toBeUndefined();
    });
  });

  describe("Cross-file analysis", () => {
    it("scopes conflict detection to same-file rules", () => {
      const index = new DrlIndex();

      // Rules in different files should NOT be flagged as conflicts
      // (too noisy without package/agenda-group scoping)
      indexDoc(index, "file:///a.drl", `
        rule "Approve"
            when
                Person( age > 18 )
            then
                modify( $p ) { setStatus("APPROVED") };
        end
      `);

      indexDoc(index, "file:///b.drl", `
        rule "Reject"
            when
                Person( age > 21 )
            then
                modify( $p ) { setStatus("REJECTED") };
        end
      `);

      const result = analyzeRules(index);
      expect(result.conflicts).toHaveLength(0);
    });

    it("detects conflicts within the same file", () => {
      const index = new DrlIndex();

      indexDoc(index, "file:///rules.drl", `
        rule "Approve"
            when
                Person( age > 18 )
            then
                modify( $p ) { setStatus("APPROVED") };
        end

        rule "Reject"
            when
                Person( age > 21 )
            then
                modify( $p ) { setStatus("REJECTED") };
        end
      `);

      const result = analyzeRules(index);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      expect(result.conflicts[0].ruleA.uri).toBe(result.conflicts[0].ruleB.uri);
    });
  });
});
