import type { z } from 'zod';
import type { Abi, AbiFunction, AbiParametersToPrimitiveTypes } from 'abitype';
import { type AbiParameter, canonicalType } from './build.js';
import { abiFunctionToZod, type AbiFunctionEntry } from './function.js';

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
      outputs?: readonly AbiParameter[];
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

// Standard "are these two types identical" trick. Used to keep only
// unambiguous name keys: if Extract<all-fns, {name:N}> matches the single
// entry F, F is the only function named N.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type FunctionEntries<A extends Abi> = Extract<A[number], { type: 'function' }>;

type SchemaFor<F extends AbiFunction> = z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>>;

type NameKeys<A extends Abi> = {
  [F in FunctionEntries<A> as Equal<
    Extract<FunctionEntries<A>, { name: F['name'] }>,
    F
  > extends true
    ? F['name']
    : never]: SchemaFor<F>;
};

export type Barrel<A extends Abi> = NameKeys<A> & {
  readonly [signature: string]: z.ZodType<unknown> | undefined;
};

export function abiToZod<const A extends Abi>(abi: A): Barrel<A> {
  const fns = filterFunctions(abi);
  const counts = new Map<string, number>();
  for (const f of fns) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);

  const out: Record<string, z.ZodType<unknown>> = {};
  for (const f of fns) {
    const schema = abiFunctionToZod(f) as z.ZodType<unknown>;
    out[canonicalSignature(f)] = schema;
    if (counts.get(f.name) === 1) out[f.name] = schema;
  }
  return out as Barrel<A>;
}
