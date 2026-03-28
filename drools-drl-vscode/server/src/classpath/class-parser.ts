/**
 * Minimal Java .class file parser.
 *
 * Parses the subset of the JVM class file format (JVM Spec Section 4) needed to
 * extract type metadata: class name, superclass, interfaces, fields, and methods.
 *
 * We explicitly skip: attributes (annotations, code, generic signatures),
 * inner classes, and anything beyond what's needed for DRL field-level completion
 * and constraint validation.
 */

import {
  JavaTypeInfo,
  JavaFieldInfo,
  JavaMethodInfo,
  descriptorToTypeName,
  parseMethodDescriptor,
  getAccessorName,
  getMutatorName,
} from "./type-model";

// ── Constants ─────────────────────────────────────────────────────────

const CLASS_MAGIC = 0xcafebabe;

// Constant pool tags
const CONSTANT_Utf8 = 1;
const CONSTANT_Integer = 3;
const CONSTANT_Float = 4;
const CONSTANT_Long = 5;
const CONSTANT_Double = 6;
const CONSTANT_Class = 7;
const CONSTANT_String = 8;
const CONSTANT_Fieldref = 9;
const CONSTANT_Methodref = 10;
const CONSTANT_InterfaceMethodref = 11;
const CONSTANT_NameAndType = 12;
const CONSTANT_MethodHandle = 15;
const CONSTANT_MethodType = 16;
const CONSTANT_Dynamic = 17;
const CONSTANT_InvokeDynamic = 18;
const CONSTANT_Module = 19;
const CONSTANT_Package = 20;

// Access flags
const ACC_PUBLIC = 0x0001;
const ACC_STATIC = 0x0008;
const ACC_FINAL = 0x0010;
const ACC_INTERFACE = 0x0200;
const ACC_ABSTRACT = 0x0400;
const ACC_ANNOTATION = 0x2000;
const ACC_ENUM = 0x4000;

// ── Reader utility ────────────────────────────────────────────────────

class BufferReader {
  private offset = 0;
  constructor(private buf: Buffer) {}

  get position(): number {
    return this.offset;
  }

  u1(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  u2(): number {
    const v = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  u4(): number {
    const v = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  bytes(n: number): Buffer {
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  skip(n: number): void {
    this.offset += n;
  }
}

// ── Constant pool types ───────────────────────────────────────────────

type ConstantPoolEntry =
  | { tag: typeof CONSTANT_Utf8; value: string }
  | { tag: typeof CONSTANT_Class; nameIndex: number }
  | { tag: typeof CONSTANT_NameAndType; nameIndex: number; descriptorIndex: number }
  | { tag: number }; // Other entries we don't need to destructure

// ── Public API ────────────────────────────────────────────────────────

/**
 * Parse a .class file buffer and extract type information.
 * Throws if the buffer is not a valid class file.
 */
export function readClassFile(
  buffer: Buffer,
  sourceUri?: string
): JavaTypeInfo {
  const reader = new BufferReader(buffer);

  // Magic number
  const magic = reader.u4();
  if (magic !== CLASS_MAGIC) {
    throw new Error(`Invalid class file: bad magic number 0x${magic.toString(16)}`);
  }

  // Version (we read but don't restrict)
  const _minorVersion = reader.u2();
  const _majorVersion = reader.u2();

  // Constant pool
  const constantPool = readConstantPool(reader);

  // Access flags
  const accessFlags = reader.u2();

  // This class and super class
  const thisClassIndex = reader.u2();
  const superClassIndex = reader.u2();

  const thisClassName = resolveClassName(constantPool, thisClassIndex);
  const superClassName =
    superClassIndex !== 0
      ? resolveClassName(constantPool, superClassIndex)
      : undefined;

  // Interfaces
  const interfacesCount = reader.u2();
  const interfaces: string[] = [];
  for (let i = 0; i < interfacesCount; i++) {
    const ifaceIndex = reader.u2();
    interfaces.push(resolveClassName(constantPool, ifaceIndex));
  }

  // Fields
  const fieldsCount = reader.u2();
  const rawFields: { name: string; descriptor: string; accessFlags: number }[] = [];
  for (let i = 0; i < fieldsCount; i++) {
    const fAccessFlags = reader.u2();
    const nameIndex = reader.u2();
    const descriptorIndex = reader.u2();
    const attributesCount = reader.u2();
    skipAttributes(reader, attributesCount);

    rawFields.push({
      name: resolveUtf8(constantPool, nameIndex),
      descriptor: resolveUtf8(constantPool, descriptorIndex),
      accessFlags: fAccessFlags,
    });
  }

  // Methods
  const methodsCount = reader.u2();
  const rawMethods: { name: string; descriptor: string; accessFlags: number }[] = [];
  for (let i = 0; i < methodsCount; i++) {
    const mAccessFlags = reader.u2();
    const nameIndex = reader.u2();
    const descriptorIndex = reader.u2();
    const attributesCount = reader.u2();
    skipAttributes(reader, attributesCount);

    rawMethods.push({
      name: resolveUtf8(constantPool, nameIndex),
      descriptor: resolveUtf8(constantPool, descriptorIndex),
      accessFlags: mAccessFlags,
    });
  }

  // Determine kind
  let kind: JavaTypeInfo["kind"];
  if (accessFlags & ACC_ANNOTATION) kind = "annotation";
  else if (accessFlags & ACC_ENUM) kind = "enum";
  else if (accessFlags & ACC_INTERFACE) kind = "interface";
  else kind = "class";

  const fqn = thisClassName.replace(/\//g, ".");
  const simpleName = fqn.includes(".") ? fqn.slice(fqn.lastIndexOf(".") + 1) : fqn;

  // Build method infos (exclude <init>, <clinit>, synthetic bridge methods)
  const methods: JavaMethodInfo[] = [];
  for (const rm of rawMethods) {
    if (rm.name.startsWith("<")) continue;
    const parsed = parseMethodDescriptor(rm.descriptor);
    methods.push({
      name: rm.name,
      returnType: parsed.returnType,
      parameters: parsed.params.map((type, idx) => ({
        name: `arg${idx}`,
        type,
      })),
      isStatic: (rm.accessFlags & ACC_STATIC) !== 0,
    });
  }

  // Build field infos — skip static fields (constants) and synthetic fields
  const setterNames = new Set(
    methods.filter((m) => m.name.startsWith("set")).map((m) => m.name)
  );

  const fields: JavaFieldInfo[] = [];
  for (const rf of rawFields) {
    if (rf.accessFlags & ACC_STATIC) continue;
    const typeName = descriptorToTypeName(rf.descriptor);
    const accessorName = getAccessorName(rf.name, typeName);
    const mutatorName = getMutatorName(rf.name);
    fields.push({
      name: rf.name,
      type: typeName,
      accessorName,
      mutatorName,
      isReadOnly: !setterNames.has(mutatorName),
    });
  }

  return {
    fullyQualifiedName: fqn,
    simpleName,
    kind,
    superClass: superClassName ? superClassName.replace(/\//g, ".") : undefined,
    interfaces: interfaces.map((i) => i.replace(/\//g, ".")),
    fields,
    methods,
    isAbstract: (accessFlags & ACC_ABSTRACT) !== 0,
    source: "class-file",
    sourceUri,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────

function readConstantPool(reader: BufferReader): ConstantPoolEntry[] {
  const count = reader.u2();
  // Index 0 is unused; entries are 1-based
  const pool: ConstantPoolEntry[] = [{ tag: 0 }];

  for (let i = 1; i < count; i++) {
    const tag = reader.u1();

    switch (tag) {
      case CONSTANT_Utf8: {
        const length = reader.u2();
        const bytes = reader.bytes(length);
        pool.push({ tag, value: bytes.toString("utf8") });
        break;
      }
      case CONSTANT_Integer:
      case CONSTANT_Float:
        reader.skip(4);
        pool.push({ tag });
        break;
      case CONSTANT_Long:
      case CONSTANT_Double:
        reader.skip(8);
        pool.push({ tag });
        // Long and double take two entries
        i++;
        pool.push({ tag: 0 });
        break;
      case CONSTANT_Class:
        pool.push({ tag, nameIndex: reader.u2() });
        break;
      case CONSTANT_String:
        reader.skip(2);
        pool.push({ tag });
        break;
      case CONSTANT_Fieldref:
      case CONSTANT_Methodref:
      case CONSTANT_InterfaceMethodref:
        reader.skip(4);
        pool.push({ tag });
        break;
      case CONSTANT_NameAndType:
        pool.push({
          tag,
          nameIndex: reader.u2(),
          descriptorIndex: reader.u2(),
        });
        break;
      case CONSTANT_MethodHandle:
        reader.skip(3);
        pool.push({ tag });
        break;
      case CONSTANT_MethodType:
        reader.skip(2);
        pool.push({ tag });
        break;
      case CONSTANT_Dynamic:
      case CONSTANT_InvokeDynamic:
        reader.skip(4);
        pool.push({ tag });
        break;
      case CONSTANT_Module:
      case CONSTANT_Package:
        reader.skip(2);
        pool.push({ tag });
        break;
      default:
        throw new Error(
          `Unknown constant pool tag ${tag} at index ${i}`
        );
    }
  }

  return pool;
}

function resolveUtf8(pool: ConstantPoolEntry[], index: number): string {
  const entry = pool[index];
  if (entry && "value" in entry && entry.tag === CONSTANT_Utf8) {
    return entry.value;
  }
  return "";
}

function resolveClassName(pool: ConstantPoolEntry[], index: number): string {
  const entry = pool[index];
  if (entry && "nameIndex" in entry && entry.tag === CONSTANT_Class) {
    return resolveUtf8(pool, entry.nameIndex);
  }
  return "";
}

function skipAttributes(reader: BufferReader, count: number): void {
  for (let i = 0; i < count; i++) {
    reader.skip(2); // attribute_name_index
    const length = reader.u4();
    reader.skip(length);
  }
}
