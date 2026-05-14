import { z } from 'zod';

type Hex = `0x${string}`;

type BoundExpr = {
  // Runtime value used by specToZod's refine predicate.
  readonly value: bigint;
  // Source expression rendered by specToSource (e.g. `(1n << 256n) - 1n`).
  // Held alongside the value so both interpreters agree on what the bound is.
  readonly source: string;
};

type Op =
  | { readonly op: 'string' }
  | { readonly op: 'boolean' }
  | { readonly op: 'regex'; readonly pattern: RegExp; readonly message?: string }
  | { readonly op: 'transformBigInt' }
  | { readonly op: 'transformHex' }
  | {
      readonly op: 'refineBigIntBound';
      readonly min?: BoundExpr;
      readonly max?: BoundExpr;
      readonly message?: string;
    };

type Spec = readonly Op[];

function specToZod(spec: Spec): z.ZodType {
  let s: z.ZodType | undefined;
  for (const op of spec) {
    switch (op.op) {
      case 'string':
        s = z.string();
        break;
      case 'boolean':
        s = z.boolean();
        break;
      case 'regex': {
        if (!s) throw new Error('regex op requires a prior schema');
        s = (s as z.ZodString).regex(op.pattern, op.message);
        break;
      }
      case 'transformBigInt': {
        if (!s) throw new Error('transformBigInt op requires a prior schema');
        s = s.transform((v: unknown) => BigInt(v as string));
        break;
      }
      case 'transformHex': {
        if (!s) throw new Error('transformHex op requires a prior schema');
        s = s.transform((v: unknown): Hex => v as Hex);
        break;
      }
      case 'refineBigIntBound': {
        if (!s) throw new Error('refineBigIntBound op requires a prior schema');
        const min = op.min?.value;
        const max = op.max?.value;
        s = s.refine(
          (n: unknown) => {
            const b = n as bigint;
            return (min === undefined || b >= min) && (max === undefined || b <= max);
          },
          op.message ? { message: op.message } : undefined,
        );
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new Error(`unhandled spec op: ${(_exhaustive as { op: string }).op}`);
      }
    }
  }
  if (!s) throw new Error('empty spec');
  return s;
}

function specToSource(spec: Spec): string {
  let s = '';
  for (const op of spec) {
    switch (op.op) {
      case 'string':
        s = 'z.string()';
        break;
      case 'boolean':
        s = 'z.boolean()';
        break;
      case 'regex':
        s = `${s}.regex(${op.pattern.toString()})`;
        break;
      case 'transformBigInt':
        s = `${s}.transform((v) => BigInt(v))`;
        break;
      case 'transformHex':
        s = `${s}.transform((v) => v as \`0x\${string}\`)`;
        break;
      case 'refineBigIntBound': {
        const checks: string[] = [];
        if (op.min) checks.push(`n >= ${op.min.source}`);
        if (op.max) checks.push(`n <= ${op.max.source}`);
        s = `${s}.refine((n) => ${checks.join(' && ')})`;
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new Error(`unhandled spec op: ${(_exhaustive as { op: string }).op}`);
      }
    }
  }
  if (!s) throw new Error('empty spec');
  return s;
}

function uintBound(bits: number): BoundExpr {
  return { value: (1n << BigInt(bits)) - 1n, source: `(1n << ${bits}n) - 1n` };
}

function intMinBound(bits: number): BoundExpr {
  return { value: -(1n << BigInt(bits - 1)), source: `-(1n << ${bits - 1}n)` };
}

function intMaxBound(bits: number): BoundExpr {
  return { value: (1n << BigInt(bits - 1)) - 1n, source: `(1n << ${bits - 1}n) - 1n` };
}

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

const SPEC_HANDLERS: PrimitiveHandlers<Spec> = {
  uint: (bits) => [
    { op: 'string' },
    { op: 'regex', pattern: /^\d+$/, message: 'Expected a decimal unsigned integer string' },
    { op: 'transformBigInt' },
    {
      op: 'refineBigIntBound',
      max: uintBound(bits),
      message: `Value exceeds uint${bits} max`,
    },
  ],
  int: (bits) => [
    { op: 'string' },
    { op: 'regex', pattern: /^-?\d+$/, message: 'Expected a decimal signed integer string' },
    { op: 'transformBigInt' },
    {
      op: 'refineBigIntBound',
      min: intMinBound(bits),
      max: intMaxBound(bits),
      message: `Value out of int${bits} range`,
    },
  ],
  bytes: () => [
    { op: 'string' },
    {
      op: 'regex',
      pattern: /^0x([0-9a-fA-F]{2})*$/,
      message: 'Expected hex string with even number of nibbles',
    },
    { op: 'transformHex' },
  ],
  bytesN: (n) => [
    { op: 'string' },
    {
      op: 'regex',
      pattern: new RegExp(`^0x[0-9a-fA-F]{${2 * n}}$`),
      message: `Expected hex string of ${n} bytes`,
    },
    { op: 'transformHex' },
  ],
  address: () => [
    { op: 'string' },
    { op: 'regex', pattern: /^0x[0-9a-fA-F]{40}$/, message: 'Expected 20-byte hex address' },
    { op: 'transformHex' },
  ],
  bool: () => [{ op: 'boolean' }],
  string: () => [{ op: 'string' }],
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

export function primitiveSpec(base: string): Spec {
  return dispatchPrimitive<Spec>(base, SPEC_HANDLERS);
}

export function primitiveSchema(base: string): z.ZodType {
  return specToZod(primitiveSpec(base));
}

export function primitiveSource(base: string): string {
  return specToSource(primitiveSpec(base));
}

export function primitiveConstName(base: string): string {
  return dispatchPrimitive<string>(base, CONST_NAME_HANDLERS);
}

// Exported for direct testing of the interpreters at the Op level. Not part
// of the public API surface — drift between the two interpreters is the
// thing the spec design exists to prevent, so these are tested directly.
export const __testing = { specToZod, specToSource };
