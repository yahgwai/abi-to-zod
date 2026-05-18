import { z } from 'zod';
import type { AbiParameter, AbiParameterToPrimitiveType } from 'abitype';
import { parseType } from './type-parser.js';
import { primitiveSchema } from './primitives.js';

// Pre-validation runtime shape: `type` is a string (not abitype's literal
// union) and `components` is always optional. We use this internally so
// recursion and rendering can work on JSON-loaded ABI data before the
// public buildParamSchema narrows to abitype's stricter version.
export type RawAbiParameter = {
  readonly type: string;
  readonly name?: string;
  readonly components?: readonly RawAbiParameter[];
};

export class BuildSchemaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BuildSchemaError';
  }
}

export function buildParamSchema<const P extends AbiParameter>(
  param: P,
  path?: readonly string[],
): z.ZodType<AbiParameterToPrimitiveType<P>> {
  return doBuild(param as unknown as RawAbiParameter, path) as z.ZodType<
    AbiParameterToPrimitiveType<P>
  >;
}

export function pickNamedComponents(
  comps: readonly RawAbiParameter[],
): readonly (readonly [string, RawAbiParameter])[] | null {
  if (comps.length === 0) return null;
  const out: (readonly [string, RawAbiParameter])[] = [];
  for (const c of comps) {
    if (typeof c.name !== 'string' || c.name === '') return null;
    out.push([c.name, c]);
  }
  return out;
}

function doBuild(param: RawAbiParameter, path: readonly string[] = []): z.ZodType {
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

    if (param.name) {
      schema = schema.describe(`${param.name}: ${canonicalType(param)}`);
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

export function canonicalType(param: RawAbiParameter): string {
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
