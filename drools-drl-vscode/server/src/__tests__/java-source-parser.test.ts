import { describe, it, expect } from "vitest";
import { parseJavaSource } from "../classpath/java-source-parser";

describe("Java Source Parser", () => {
  it("parses a simple POJO class", () => {
    const source = `
package com.example.model;

public class Person {
    private String name;
    private int age;
    private boolean active;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
`;

    const result = parseJavaSource(source, "/path/to/Person.java");
    expect(result).toBeDefined();
    expect(result!.fullyQualifiedName).toBe("com.example.model.Person");
    expect(result!.simpleName).toBe("Person");
    expect(result!.kind).toBe("class");
    expect(result!.source).toBe("java-source");

    // Check fields
    const fieldNames = result!.fields.map((f) => f.name);
    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("age");
    expect(fieldNames).toContain("active");

    // Check field types
    const nameField = result!.fields.find((f) => f.name === "name");
    expect(nameField?.type).toBe("String");

    const ageField = result!.fields.find((f) => f.name === "age");
    expect(ageField?.type).toBe("int");

    // Check accessor names
    const activeField = result!.fields.find((f) => f.name === "active");
    expect(activeField?.accessorName).toBe("isActive");
  });

  it("parses a class with inheritance", () => {
    const source = `
package com.example.model;

public class Employee extends Person implements Serializable {
    private String department;
}
`;

    const result = parseJavaSource(source, "/path/to/Employee.java");
    expect(result).toBeDefined();
    expect(result!.superClass).toBe("com.example.model.Person");
    expect(result!.interfaces).toContain("java.lang.Serializable");
  });

  it("parses an interface", () => {
    const source = `
package com.example.api;

public interface Validator {
    boolean validate(String input);
    String getDescription();
}
`;

    const result = parseJavaSource(source, "/path/to/Validator.java");
    expect(result).toBeDefined();
    expect(result!.kind).toBe("interface");
    expect(result!.methods.length).toBeGreaterThanOrEqual(2);
  });

  it("parses an enum", () => {
    const source = `
package com.example.model;

public enum Status {
    ACTIVE, INACTIVE, PENDING;
}
`;

    const result = parseJavaSource(source, "/path/to/Status.java");
    expect(result).toBeDefined();
    expect(result!.kind).toBe("enum");
  });

  it("infers fields from getters without explicit field declarations", () => {
    const source = `
package com.example.model;

public class Computed {
    public String getFullName() { return firstName + " " + lastName; }
    public int getTotal() { return quantity * price; }
}
`;

    const result = parseJavaSource(source, "/path/to/Computed.java");
    expect(result).toBeDefined();
    const fieldNames = result!.fields.map((f) => f.name);
    expect(fieldNames).toContain("fullName");
    expect(fieldNames).toContain("total");
  });

  it("marks fields as read-only when no setter exists", () => {
    const source = `
package com.example.model;

public class ReadOnlyBean {
    private String id;

    public String getId() { return id; }
}
`;

    const result = parseJavaSource(source, "/path/to/ReadOnlyBean.java");
    expect(result).toBeDefined();
    const idField = result!.fields.find((f) => f.name === "id");
    expect(idField?.isReadOnly).toBe(true);
  });

  it("skips static fields", () => {
    const source = `
package com.example.model;

public class Constants {
    private static final String TYPE = "CONST";
    private String name;
}
`;

    const result = parseJavaSource(source, "/path/to/Constants.java");
    expect(result).toBeDefined();
    const fieldNames = result!.fields.map((f) => f.name);
    expect(fieldNames).not.toContain("TYPE");
    expect(fieldNames).toContain("name");
  });

  it("returns undefined for unparseable content", () => {
    const result = parseJavaSource("not a java file", "/path/to/bad.java");
    expect(result).toBeUndefined();
  });

  it("handles a class without package declaration", () => {
    const source = `
public class Simple {
    private int value;
}
`;

    const result = parseJavaSource(source, "/path/to/Simple.java");
    expect(result).toBeDefined();
    expect(result!.fullyQualifiedName).toBe("Simple");
  });
});
