import { z } from 'zod';
import type {
  Abi,
  AbiFunction,
  AbiParameter,
  AbiParametersToPrimitiveTypes,
} from 'abitype';
import {
  type RawAbiParameter,
  buildParamSchema,
  canonicalType,
} from './build.js';

export type AbiFunctionEntry = {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: readonly RawAbiParameter[];
  readonly outputs?: readonly RawAbiParameter[];
  readonly stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
};

export function buildFunctionInputsSchema<const F extends AbiFunctionEntry>(
  entry: F,
): z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>> {
  if (entry.type !== 'function') {
    throw new Error(
      `buildFunctionInputsSchema expects a function entry, got type=${JSON.stringify((entry as { type?: string }).type ?? '<missing>')}`,
    );
  }
  const items = entry.inputs.map((input, i) => buildParamSchema(input, [`inputs[${i}]`]));
  return z.tuple(items as [z.ZodType, ...z.ZodType[]]) as unknown as z.ZodType<
    AbiParametersToPrimitiveTypes<F['inputs']>
  >;
}

export type { Abi };
export { canonicalType };

export function canonicalSignature(entry: AbiFunctionEntry): string {
  return `${entry.name}(${entry.inputs.map(canonicalType).join(',')})`;
}

export function filterFunctions(abi: Abi): AbiFunctionEntry[] {
  const out: AbiFunctionEntry[] = [];
  for (let i = 0; i < abi.length; i++) {
    const e = abi[i] as {
      type?: string;
      name?: unknown;
      inputs?: unknown;
      outputs?: readonly RawAbiParameter[];
    };
    if (e.type !== 'function') continue;
    if (typeof e.name !== 'string') {
      throw new Error(`abi[${i}]: function entry has missing or non-string 'name'`);
    }
    if (!Array.isArray(e.inputs)) {
      throw new Error(
        `abi[${i}] (${e.name}): function entry has missing or non-array 'inputs'`,
      );
    }
    out.push(e as unknown as AbiFunctionEntry);
  }
  return out;
}

// Standard type-equality trick; used to filter unambiguous name keys and
// to anchor the structural assertion in viem-compat tests.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

// Type-level array-suffix peel: 'uint256[][3]' -> ['uint256', '[][3]'].
// Mirrors runtime parseType.
type SplitArraySuffix<T extends string, Acc extends string = ''> =
  T extends `${infer Base}[${infer Size}]`
    ? SplitArraySuffix<Base, `[${Size}]${Acc}`>
    : [T, Acc];

type NormalizeBase<B extends string> = B extends 'uint'
  ? 'uint256'
  : B extends 'int'
    ? 'int256'
    : B;

type ParamsToCanonicalString<P extends readonly AbiParameter[]> =
  P extends readonly [
    infer Head extends AbiParameter,
    ...infer Tail extends readonly AbiParameter[],
  ]
    ? Tail extends readonly []
      ? CanonicalTypeOf<Head>
      : `${CanonicalTypeOf<Head>},${ParamsToCanonicalString<Tail>}`
    : '';

// Type-level canonicalType(): MUST match canonicalType() in build.ts
// byte-for-byte, or signature-key lookups mismatch.
type CanonicalTypeOf<P extends AbiParameter> =
  SplitArraySuffix<P['type']> extends [
    infer Base extends string,
    infer Suffix extends string,
  ]
    ? Base extends 'tuple'
      ? P extends { components: infer C extends readonly AbiParameter[] }
        ? `(${ParamsToCanonicalString<C>})${Suffix}`
        : never
      : `${NormalizeBase<Base>}${Suffix}`
    : never;

// Type-level canonicalSignature(): MUST equal runtime canonicalSignature(f),
// otherwise SchemaTable lookups by signature key mismatch.
export type Sig<F extends AbiFunction> =
  `${F['name']}(${ParamsToCanonicalString<F['inputs']>})`;

type FunctionEntries<A extends Abi> = Extract<A[number], { type: 'function' }>;

type SchemaFor<F extends AbiFunction> = z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>>;

// Unambiguous-name -> schema; overloaded names map to `never` so callers
// must reach for the signature key. Matches buildSchemas' runtime rule.
type NameKeys<A extends Abi> = {
  [F in FunctionEntries<A> as Equal<
    Extract<FunctionEntries<A>, { name: F['name'] }>,
    F
  > extends true
    ? F['name']
    : never]: SchemaFor<F>;
};

// Every function -> schema, keyed by canonical signature. No loose index
// signature: every entry is addressable at its exact inferred type.
type SignatureKeys<A extends Abi> = {
  [F in FunctionEntries<A> as Sig<F>]: SchemaFor<F>;
};

export type SchemaTable<A extends Abi> = NameKeys<A> & SignatureKeys<A>;

export type FunctionPlanEntry = {
  readonly entry: AbiFunctionEntry;
  readonly signature: string;
  readonly overloaded: boolean;
};

// Shared by buildSchemas and the codegen: keeps overload detection in one
// place so the runtime table and generated source can't disagree.
export function planFunctions(abi: Abi): FunctionPlanEntry[] {
  const fns = filterFunctions(abi);
  const counts = new Map<string, number>();
  for (const f of fns) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  return fns.map((entry) => ({
    entry,
    signature: canonicalSignature(entry),
    overloaded: (counts.get(entry.name) ?? 0) > 1,
  }));
}

export function buildSchemas<const A extends Abi>(abi: A): SchemaTable<A> {
  const out: Record<string, z.ZodType<unknown>> = {};
  for (const { entry, signature, overloaded } of planFunctions(abi)) {
    const schema = buildFunctionInputsSchema(entry) as z.ZodType<unknown>;
    out[signature] = schema;
    if (!overloaded) out[entry.name] = schema;
  }
  return out as SchemaTable<A>;
}
