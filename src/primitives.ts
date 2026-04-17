import { z } from 'zod';

type Hex = `0x${string}`;

function uintSchema(bits: number) {
  const max = (1n << BigInt(bits)) - 1n;
  return z
    .string()
    .regex(/^\d+$/, 'Expected a decimal unsigned integer string')
    .transform((v) => BigInt(v))
    .refine((n) => n <= max, { message: `Value exceeds uint${bits} max` });
}

function intSchema(bits: number) {
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits - 1)) - 1n;
  return z
    .string()
    .regex(/^-?\d+$/, 'Expected a decimal signed integer string')
    .transform((v) => BigInt(v))
    .refine((n) => n >= min && n <= max, { message: `Value out of int${bits} range` });
}

function bytesNSchema(n: number) {
  const re = new RegExp(`^0x[0-9a-fA-F]{${2 * n}}$`);
  return z
    .string()
    .regex(re, `Expected hex string of ${n} bytes`)
    .transform((v): Hex => v as Hex);
}

const bytesSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, 'Expected hex string with even number of nibbles')
  .transform((v): Hex => v as Hex);

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected 20-byte hex address')
  .transform((v): Hex => v as Hex);

const boolSchema = z.boolean();
const stringSchema = z.string();

const UINT_RE = /^uint(\d+)$/;
const INT_RE = /^int(\d+)$/;
const BYTES_RE = /^bytes(\d+)$/;
const UFIXED_RE = /^u?fixed\d+x\d+$/;

export function primitiveSchema(base: string): z.ZodType {
  if (base === 'uint') return uintSchema(256);
  if (base === 'int') return intSchema(256);

  const um = UINT_RE.exec(base);
  if (um) {
    const n = Number(um[1]!);
    if (n < 8 || n > 256 || n % 8 !== 0) {
      throw new Error(`Invalid uint width: ${base}`);
    }
    return uintSchema(n);
  }
  const im = INT_RE.exec(base);
  if (im) {
    const n = Number(im[1]!);
    if (n < 8 || n > 256 || n % 8 !== 0) {
      throw new Error(`Invalid int width: ${base}`);
    }
    return intSchema(n);
  }

  if (base === 'bytes') return bytesSchema;
  const bm = BYTES_RE.exec(base);
  if (bm) {
    const n = Number(bm[1]!);
    if (n < 1 || n > 32) {
      throw new Error(`Invalid bytes width: ${base}`);
    }
    return bytesNSchema(n);
  }

  if (base === 'address') return addressSchema;
  if (base === 'bool') return boolSchema;
  if (base === 'string') return stringSchema;

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
