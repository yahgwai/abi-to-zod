import type { z } from 'zod';
import type {
  Abi,
  AbiFunction,
  AbiParameter,
  AbiParametersToPrimitiveTypes,
} from 'abitype';
import { type AbiParameter as LooseAbiParameter, canonicalType } from './build.js';
import { buildFunctionInputsSchema, type AbiFunctionEntry } from './function.js';

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
      outputs?: readonly LooseAbiParameter[];
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

// Standard "are these two types identical" trick. Used both to filter
// unambiguous name keys and to anchor the assertion in viem-compat tests.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

// Peel array suffixes off a Solidity type string. Mirrors what parseType
// does at runtime: `'uint256[][3]'` -> `['uint256', '[][3]']`.
type SplitArraySuffix<T extends string, Acc extends string = ''> =
  T extends `${infer Base}[${infer Size}]`
    ? SplitArraySuffix<Base, `[${Size}]${Acc}`>
    : [T, Acc];

type NormalizeBase<B extends string> = B extends 'uint'
  ? 'uint256'
  : B extends 'int'
    ? 'int256'
    : B;

// Comma-join the canonical types of an ABI parameter tuple.
type ParamsToCanonicalString<P extends readonly AbiParameter[]> =
  P extends readonly [
    infer Head extends AbiParameter,
    ...infer Tail extends readonly AbiParameter[],
  ]
    ? Tail extends readonly []
      ? CanonicalTypeOf<Head>
      : `${CanonicalTypeOf<Head>},${ParamsToCanonicalString<Tail>}`
    : '';

// Canonical Solidity type for a single parameter — must match
// canonicalType() in build.ts character-for-character. Tuple components
// render as `(child1,child2,...)`, then the parsed array suffixes are
// appended verbatim.
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

// Canonical `name(inputTypes...)` signature for a function — must equal
// canonicalSignature(f) at runtime for the same entry, otherwise table
// lookups by signature key mismatch.
export type Sig<F extends AbiFunction> =
  `${F['name']}(${ParamsToCanonicalString<F['inputs']>})`;

type FunctionEntries<A extends Abi> = Extract<A[number], { type: 'function' }>;

type SchemaFor<F extends AbiFunction> = z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>>;

// Unambiguous function name -> schema. Overloaded names map to `never` so
// callers must reach for the signature key instead, mirroring runtime
// (buildSchemas only writes the bare-name slot when counts.get(name) === 1).
type NameKeys<A extends Abi> = {
  [F in FunctionEntries<A> as Equal<
    Extract<FunctionEntries<A>, { name: F['name'] }>,
    F
  > extends true
    ? F['name']
    : never]: SchemaFor<F>;
};

// Every function -> schema, keyed by the canonical signature string. No
// loose index signature: overloaded and uniquely-named functions are both
// addressable here at exact types.
type SignatureKeys<A extends Abi> = {
  [F in FunctionEntries<A> as Sig<F>]: SchemaFor<F>;
};

export type SchemaTable<A extends Abi> = NameKeys<A> & SignatureKeys<A>;

export type FunctionPlanEntry = {
  readonly entry: AbiFunctionEntry;
  readonly signature: string;
  readonly overloaded: boolean;
};

// Shared "what functions are in this ABI" pass. Both buildSchemas and the
// codegen consume this; keeping the overload-detection rule in one place
// means the runtime table and the generated source can't disagree on
// which names are unambiguous.
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
