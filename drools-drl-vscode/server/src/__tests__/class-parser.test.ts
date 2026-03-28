import { describe, it, expect } from "vitest";
import { readClassFile } from "../classpath/class-parser";
import {
  descriptorToTypeName,
  parseMethodDescriptor,
} from "../classpath/type-model";

describe("Class File Parser", () => {
  /**
   * Build a minimal valid .class file buffer for testing.
   * This constructs a stripped-down class file with the bare minimum
   * structure: magic, version, constant pool, access flags, this/super,
   * interfaces, fields, methods, and attributes.
   */
  function buildMinimalClassFile(opts: {
    className: string;
    superClass?: string;
    fields?: { name: string; descriptor: string; accessFlags: number }[];
    methods?: { name: string; descriptor: string; accessFlags: number }[];
    interfaces?: string[];
    accessFlags?: number;
  }): Buffer {
    const pool: Buffer[] = [];
    const poolEntries: any[] = [null]; // Index 0 unused
    let nextIndex = 1;

    function addUtf8(value: string): number {
      const idx = nextIndex++;
      const encoded = Buffer.from(value, "utf8");
      const entry = Buffer.alloc(3 + encoded.length);
      entry.writeUInt8(1, 0); // CONSTANT_Utf8
      entry.writeUInt16BE(encoded.length, 1);
      encoded.copy(entry, 3);
      pool.push(entry);
      poolEntries.push({ tag: 1, value });
      return idx;
    }

    function addClass(name: string): number {
      const nameIdx = addUtf8(name);
      const idx = nextIndex++;
      const entry = Buffer.alloc(3);
      entry.writeUInt8(7, 0); // CONSTANT_Class
      entry.writeUInt16BE(nameIdx, 1);
      pool.push(entry);
      poolEntries.push({ tag: 7, nameIndex: nameIdx });
      return idx;
    }

    const thisClassIdx = addClass(opts.className.replace(/\./g, "/"));
    const superClassIdx = addClass(
      (opts.superClass || "java/lang/Object").replace(/\./g, "/")
    );

    const interfaceIdxs: number[] = [];
    for (const iface of opts.interfaces || []) {
      interfaceIdxs.push(addClass(iface.replace(/\./g, "/")));
    }

    // Prepare fields
    const fieldEntries: { nameIdx: number; descIdx: number; flags: number }[] = [];
    for (const f of opts.fields || []) {
      fieldEntries.push({
        nameIdx: addUtf8(f.name),
        descIdx: addUtf8(f.descriptor),
        flags: f.accessFlags,
      });
    }

    // Prepare methods
    const methodEntries: { nameIdx: number; descIdx: number; flags: number }[] = [];
    for (const m of opts.methods || []) {
      methodEntries.push({
        nameIdx: addUtf8(m.name),
        descIdx: addUtf8(m.descriptor),
        flags: m.accessFlags,
      });
    }

    // Build the buffer
    const parts: Buffer[] = [];

    // Magic + version
    const header = Buffer.alloc(8);
    header.writeUInt32BE(0xcafebabe, 0);
    header.writeUInt16BE(0, 4); // minor
    header.writeUInt16BE(52, 6); // major (Java 8)
    parts.push(header);

    // Constant pool count
    const cpCount = Buffer.alloc(2);
    cpCount.writeUInt16BE(nextIndex, 0);
    parts.push(cpCount);

    // Constant pool entries
    parts.push(...pool);

    // Access flags
    const flags = Buffer.alloc(2);
    flags.writeUInt16BE(opts.accessFlags ?? 0x0021, 0); // ACC_PUBLIC | ACC_SUPER
    parts.push(flags);

    // This class
    const thisClass = Buffer.alloc(2);
    thisClass.writeUInt16BE(thisClassIdx, 0);
    parts.push(thisClass);

    // Super class
    const superClass = Buffer.alloc(2);
    superClass.writeUInt16BE(superClassIdx, 0);
    parts.push(superClass);

    // Interfaces
    const ifaceCount = Buffer.alloc(2);
    ifaceCount.writeUInt16BE(interfaceIdxs.length, 0);
    parts.push(ifaceCount);
    for (const idx of interfaceIdxs) {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(idx, 0);
      parts.push(b);
    }

    // Fields
    const fCount = Buffer.alloc(2);
    fCount.writeUInt16BE(fieldEntries.length, 0);
    parts.push(fCount);
    for (const f of fieldEntries) {
      const entry = Buffer.alloc(8);
      entry.writeUInt16BE(f.flags, 0);
      entry.writeUInt16BE(f.nameIdx, 2);
      entry.writeUInt16BE(f.descIdx, 4);
      entry.writeUInt16BE(0, 6); // attributes_count
      parts.push(entry);
    }

    // Methods
    const mCount = Buffer.alloc(2);
    mCount.writeUInt16BE(methodEntries.length, 0);
    parts.push(mCount);
    for (const m of methodEntries) {
      const entry = Buffer.alloc(8);
      entry.writeUInt16BE(m.flags, 0);
      entry.writeUInt16BE(m.nameIdx, 2);
      entry.writeUInt16BE(m.descIdx, 4);
      entry.writeUInt16BE(0, 6); // attributes_count
      parts.push(entry);
    }

    // Attributes (class level)
    const attrCount = Buffer.alloc(2);
    attrCount.writeUInt16BE(0, 0);
    parts.push(attrCount);

    return Buffer.concat(parts);
  }

  it("parses a minimal class file with fields", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.model.Person",
      fields: [
        { name: "name", descriptor: "Ljava/lang/String;", accessFlags: 0x0002 }, // private
        { name: "age", descriptor: "I", accessFlags: 0x0002 },
      ],
      methods: [
        { name: "getName", descriptor: "()Ljava/lang/String;", accessFlags: 0x0001 },
        { name: "setName", descriptor: "(Ljava/lang/String;)V", accessFlags: 0x0001 },
        { name: "getAge", descriptor: "()I", accessFlags: 0x0001 },
        { name: "setAge", descriptor: "(I)V", accessFlags: 0x0001 },
      ],
    });

    const result = readClassFile(buf);
    expect(result.fullyQualifiedName).toBe("com.example.model.Person");
    expect(result.simpleName).toBe("Person");
    expect(result.kind).toBe("class");
    expect(result.superClass).toBe("java.lang.Object");

    // Fields
    expect(result.fields).toHaveLength(2);
    const nameField = result.fields.find((f) => f.name === "name");
    expect(nameField?.type).toBe("java.lang.String");
    expect(nameField?.accessorName).toBe("getName");
    expect(nameField?.mutatorName).toBe("setName");
    expect(nameField?.isReadOnly).toBe(false);

    const ageField = result.fields.find((f) => f.name === "age");
    expect(ageField?.type).toBe("int");

    // Methods (excluding <init>, <clinit>)
    expect(result.methods).toHaveLength(4);
  });

  it("skips static fields", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.Constants",
      fields: [
        { name: "TYPE", descriptor: "Ljava/lang/String;", accessFlags: 0x0019 }, // public static final
        { name: "value", descriptor: "I", accessFlags: 0x0002 },
      ],
    });

    const result = readClassFile(buf);
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].name).toBe("value");
  });

  it("detects interfaces", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.api.Validator",
      accessFlags: 0x0601, // public abstract interface
    });

    const result = readClassFile(buf);
    expect(result.kind).toBe("interface");
    expect(result.isAbstract).toBe(true);
  });

  it("detects enums", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.Status",
      accessFlags: 0x4031, // public final enum ACC_SUPER
      superClass: "java/lang/Enum",
    });

    const result = readClassFile(buf);
    expect(result.kind).toBe("enum");
  });

  it("parses interfaces list", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.model.Employee",
      interfaces: ["java.io.Serializable", "java.lang.Comparable"],
    });

    const result = readClassFile(buf);
    expect(result.interfaces).toContain("java.io.Serializable");
    expect(result.interfaces).toContain("java.lang.Comparable");
  });

  it("marks fields as read-only when no setter exists", () => {
    const buf = buildMinimalClassFile({
      className: "com.example.ReadOnly",
      fields: [
        { name: "id", descriptor: "Ljava/lang/String;", accessFlags: 0x0002 },
      ],
      methods: [
        { name: "getId", descriptor: "()Ljava/lang/String;", accessFlags: 0x0001 },
        // No setId
      ],
    });

    const result = readClassFile(buf);
    const idField = result.fields.find((f) => f.name === "id");
    expect(idField?.isReadOnly).toBe(true);
  });

  it("throws on invalid magic number", () => {
    const buf = Buffer.alloc(100);
    buf.writeUInt32BE(0xdeadbeef, 0);
    expect(() => readClassFile(buf)).toThrow("Invalid class file");
  });
});
