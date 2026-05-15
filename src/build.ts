import { z } from 'zod';
import type {
  AbiParameter as AbitypeAbiParameter,
  AbiParameterToPrimitiveType,
} from 'abitype';
import { parseType } from './type-parser.js';
import { primitiveSchema } from './primitives.js';

// Loose local shape kept for internal recursion and the renderer helpers,
// which both operate on runtime-derived data (JSON-loaded ABIs). The public
// entry point below narrows to abitype's stricter union for type inference.
export type AbiParameter = {
  readonly type: string;
  readonly name?: string;
  readonly components?: readonly AbiParameter[];
};

export class BuildSchemaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BuildSchemaError';
  }
}

export function buildSchema<const P extends AbitypeAbiParameter>(
  param: P,
  path?: readonly string[],
): z.ZodType<AbiParameterToPrimitiveType<P>> {
  return doBuild(param as unknown as AbiParameter, path) as z.ZodType<
    AbiParameterToPrimitiveType<P>
  >;
}

// Mirrors abitype's AbiComponentsToPrimitiveType: when every struct
// component carries a non-empty `name`, the inferred type is an object
// keyed by those names; otherwise it's a positional tuple. We branch the
// runtime here so it actually delivers what `buildSchema`'s typed return
// claims. Top-level function inputs stay positional (handled in
// abiFunctionToZod) — only struct components opt into the object shape.
//
// Returning the typed pairs (rather than a boolean) carries the
// "name is a non-empty string" narrowing through to the call sites,
// so the object branch never needs an `as string` cast.
export function pickNamedComponents(
  comps: readonly AbiParameter[],
): readonly (readonly [string, AbiParameter])[] | null {
  if (comps.length === 0) return null;
  const out: (readonly [string, AbiParameter])[] = [];
  for (const c of comps) {
    if (typeof c.name !== 'string' || c.name === '') return null;
    out.push([c.name, c]);
  }
  return out;
}

function doBuild(param: AbiParameter, path: readonly string[] = []): z.ZodType {
  try {
    const { base, suffixes } = parseType(param.type);

    let schema: z.ZodType;
    if (base === 'tuple') {
      if (!param.components) {
        throw new Error(`tuple type missing 'components'`);
      }
      const named = pickNamedComponents(param.components);
      if (named) {
        const shape: Record<string, z.ZodType> = {};
        named.forEach(([name, c], i) => {
          shape[name] = doBuild(c, [...path, `components[${i}]`]);
        });
        schema = z.strictObject(shape);
      } else {
        const componentSchemas = param.components.map((c, i) =>
          doBuild(c, [...path, `components[${i}]`]),
        );
        schema = z.tuple(componentSchemas as [z.ZodType, ...z.ZodType[]]);
      }
    } else {
      schema = primitiveSchema(base);
    }

    for (const suffix of suffixes) {
      schema = suffix === null ? z.array(schema) : z.array(schema).length(suffix);
    }

    return schema;
  } catch (err) {
    if (err instanceof BuildSchemaError) throw err;
    const where = path.length > 0 ? path.join('.') : '<root>';
    const inner = err instanceof Error ? err.message : String(err);
    throw new BuildSchemaError(
      `Failed to build schema at ${where} (type=${JSON.stringify(param.type)}, name=${JSON.stringify(param.name ?? '')}): ${inner}`,
      { cause: err },
    );
  }
}

export function canonicalType(param: AbiParameter): string {
  const { base, suffixes } = parseType(param.type);
  let s: string;
  if (base === 'tuple') {
    s = `(${(param.components ?? []).map(canonicalType).join(',')})`;
  } else {
    s = base === 'uint' ? 'uint256' : base === 'int' ? 'int256' : base;
  }
  for (const suffix of suffixes) {
    s += suffix === null ? '[]' : `[${suffix}]`;
  }
  return s;
}
