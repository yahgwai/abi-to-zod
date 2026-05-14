import { z } from 'zod';

type Hex = `0x${string}`;

const UINT_RE = /^uint(\d+)$/;
const INT_RE = /^int(\d+)$/;
const BYTES_RE = /^bytes(\d+)$/;
const UFIXED_RE = /^u?fixed\d+x\d+$/;

type PrimitiveHandlers<T> = {
  uint: (bits: number) => T;
  int: (bits: number) => T;
  bytes: () => T;
  bytesN: (n: number) => T;
  address: () => T;
  bool: () => T;
  string: () => T;
};

function dispatchPrimitive<T>(base: string, h: PrimitiveHandlers<T>): T {
  if (base === 'uint') return h.uint(256);
  if (base === 'int') return h.int(256);

  const um = UINT_RE.exec(base);
  if (um) {
    const n = Number(um[1]!);
    if (n < 8 || n > 256 || n % 8 !== 0) {
      throw new Error(`Invalid uint width: ${base}`);
    }
    return h.uint(n);
  }
  const im = INT_RE.exec(base);
  if (im) {
    const n = Number(im[1]!);
    if (n < 8 || n > 256 || n % 8 !== 0) {
      throw new Error(`Invalid int width: ${base}`);
    }
    return h.int(n);
  }

  if (base === 'bytes') return h.bytes();
  const bm = BYTES_RE.exec(base);
  if (bm) {
    const n = Number(bm[1]!);
    if (n < 1 || n > 32) {
      throw new Error(`Invalid bytes width: ${base}`);
    }
    return h.bytesN(n);
  }

  if (base === 'address') return h.address();
  if (base === 'bool') return h.bool();
  if (base === 'string') return h.string();

  if (base === 'function') {
    throw new Error(`Unsupported Solidity type: function (function pointers are not supported)`);
  }
  if (base === 'fixed' || base === 'ufixed' || UFIXED_RE.test(base)) {
    throw new Error(`Unsupported Solidity type: ${base} (fixed-point types are not supported)`);
  }
  if (base === 'tuple') {
    throw new Error('tuple must be handled by the builder, not primitiveSchema');
  }

  throw new Error(`Unknown Solidity primitive type: ${base}`);
}

const SCHEMA_HANDLERS: PrimitiveHandlers<z.ZodType> = {
  uint: (bits) => {
    const max = (1n << BigInt(bits)) - 1n;
    return z
      .string()
      .regex(/^\d+$/, 'Expected a decimal unsigned integer string')
      .transform((v) => BigInt(v))
      .refine((n) => n <= max, { message: `Value exceeds uint${bits} max` });
  },
  int: (bits) => {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    return z
      .string()
      .regex(/^-?\d+$/, 'Expected a decimal signed integer string')
      .transform((v) => BigInt(v))
      .refine((n) => n >= min && n <= max, { message: `Value out of int${bits} range` });
  },
  bytes: () =>
    z
      .string()
      .regex(/^0x([0-9a-fA-F]{2})*$/, 'Expected hex string with even number of nibbles')
      .transform((v): Hex => v as Hex),
  bytesN: (n) =>
    z
      .string()
      .regex(new RegExp(`^0x[0-9a-fA-F]{${2 * n}}$`), `Expected hex string of ${n} bytes`)
      .transform((v): Hex => v as Hex),
  address: () =>
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected 20-byte hex address')
      .transform((v): Hex => v as Hex),
  bool: () => z.boolean(),
  string: () => z.string(),
};

const SOURCE_HANDLERS: PrimitiveHandlers<string> = {
  uint: (bits) =>
    `z.string().regex(/^\\d+$/).transform((v) => BigInt(v)).refine((n) => n <= (1n << ${bits}n) - 1n)`,
  int: (bits) =>
    `z.string().regex(/^-?\\d+$/).transform((v) => BigInt(v)).refine((n) => n >= -(1n << ${bits - 1}n) && n <= (1n << ${bits - 1}n) - 1n)`,
  bytes: () =>
    'z.string().regex(/^0x([0-9a-fA-F]{2})*$/).transform((v) => v as `0x${string}`)',
  bytesN: (n) =>
    `z.string().regex(/^0x[0-9a-fA-F]{${2 * n}}$/).transform((v) => v as \`0x\${string}\`)`,
  address: () =>
    'z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`)',
  bool: () => 'z.boolean()',
  string: () => 'z.string()',
};

const CONST_NAME_HANDLERS: PrimitiveHandlers<string> = {
  uint: (bits) => `UINT${bits}`,
  int: (bits) => `INT${bits}`,
  bytes: () => 'BYTES',
  bytesN: (n) => `BYTES${n}`,
  address: () => 'ADDRESS',
  bool: () => 'BOOL',
  string: () => 'STRING',
};

export function primitiveSchema(base: string): z.ZodType {
  return dispatchPrimitive<z.ZodType>(base, SCHEMA_HANDLERS);
}

export function primitiveSource(base: string): string {
  return dispatchPrimitive<string>(base, SOURCE_HANDLERS);
}

export function primitiveConstName(base: string): string {
  return dispatchPrimitive<string>(base, CONST_NAME_HANDLERS);
}
