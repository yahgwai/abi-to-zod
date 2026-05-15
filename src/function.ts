import { z } from 'zod';
import type { AbiParametersToPrimitiveTypes } from 'abitype';
import { buildSchema, type AbiParameter } from './build.js';

export type AbiFunctionEntry = {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: readonly AbiParameter[];
  readonly outputs?: readonly AbiParameter[];
  readonly stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
};

export function abiFunctionToZod<const F extends AbiFunctionEntry>(
  entry: F,
): z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>> {
  if (entry.type !== 'function') {
    throw new Error(
      `abiFunctionToZod expects a function entry, got type=${JSON.stringify((entry as { type?: string }).type ?? '<missing>')}`,
    );
  }
  const items = entry.inputs.map((input, i) => buildSchema(input, [`inputs[${i}]`]));
  return z.tuple(items as [z.ZodType, ...z.ZodType[]]) as unknown as z.ZodType<
    AbiParametersToPrimitiveTypes<F['inputs']>
  >;
}
