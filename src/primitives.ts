import { z } from 'zod';

type Hex = `0x${string}`;

// BoundExpr carries the bigint twice — once as a value the runtime refine
// uses directly, once as a source expression codegen renders verbatim.
// Two adjacent fields in one place is the deliberate trade for readable
// generated output (`(1n << 256n) - 1n` instead of the resolved literal).
// Cross-checked per width in primitives-spec.test.ts.
type BoundExpr = {
  readonly value: bigint;
  readonly source: string;
};

type RootOp =
  | { readonly op: 'string' }
  | { readonly op: 'boolean' };

type ChainOp =
  | { readonly op: 'regex'; readonly pattern: RegExp; readonly message?: string }
  | { readonly op: 'transformBigInt' }
  | { readonly op: 'transformHex' }
  | {
      readonly op: 'refineBigIntBound';
      readonly min?: BoundExpr;
      readonly max?: BoundExpr;
      readonly message?: string;
    };

type Spec = readonly [RootOp, ...ChainOp[]];

function applyRoot(root: RootOp): z.ZodType {
  switch (root.op) {
    case 'string':
      return z.string();
    case 'boolean':
      return z.boolean();
    default: {
      const _: never = root;
      throw new Error(`unhandled root op: ${(_ as { op: string }).op}`);
    }
  }
}

function applyChainZod(s: z.ZodType, op: ChainOp): z.ZodType {
  switch (op.op) {
    case 'regex':
      return (s as z.ZodString).regex(op.pattern, op.message);
    case 'transformBigInt':
      return s.transform((v: unknown) => BigInt(v as string));
    case 'transformHex':
      return s.transform((v: unknown): Hex => v as Hex);
    case 'refineBigIntBound': {
      const min = op.min?.value;
      const max = op.max?.value;
      return s.refine(
        (n: unknown) => {
          const b = n as bigint;
          return (min === undefined || b >= min) && (max === undefined || b <= max);
        },
        op.message ? { message: op.message } : undefined,
      );
    }
    default: {
      const _: never = op;
      throw new Error(`unhandled chain op: ${(_ as { op: string }).op}`);
    }
  }
}

function rootSource(root: RootOp): string {
  switch (root.op) {
    case 'string':
      return 'z.string()';
    case 'boolean':
      return 'z.boolean()';
    default: {
      const _: never = root;
      throw new Error(`unhandled root op: ${(_ as { op: string }).op}`);
    }
  }
}

function chainSource(s: string, op: ChainOp): string {
  switch (op.op) {
    case 'regex':
      return `${s}.regex(${op.pattern.toString()})`;
    case 'transformBigInt':
      return `${s}.transform((v) => BigInt(v))`;
    case 'transformHex':
      return `${s}.transform((v) => v as \`0x\${string}\`)`;
    case 'refineBigIntBound': {
      const checks: string[] = [];
      if (op.min) checks.push(`n >= ${op.min.source}`);
      if (op.max) checks.push(`n <= ${op.max.source}`);
      return `${s}.refine((n) => ${checks.join(' && ')})`;
    }
    default: {
      const _: never = op;
      throw new Error(`unhandled chain op: ${(_ as { op: string }).op}`);
    }
  }
}

function specToZod([root, ...chain]: Spec): z.ZodType {
  return chain.reduce(applyChainZod, applyRoot(root));
}

function specToSource([root, ...chain]: Spec): string {
  return chain.reduce(chainSource, rootSource(root));
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
