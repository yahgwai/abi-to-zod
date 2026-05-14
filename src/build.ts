import { z } from 'zod';
import { parseType } from './type-parser.js';
import { primitiveSchema, primitiveConstName } from './primitives.js';

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

export function buildSchema(param: AbiParameter, path: readonly string[] = []): z.ZodType {
  try {
    const { base, suffixes } = parseType(param.type);

    let schema: z.ZodType;
    if (base === 'tuple') {
      if (!param.components) {
        throw new Error(`tuple type missing 'components'`);
      }
      const componentSchemas = param.components.map((c, i) =>
        buildSchema(c, [...path, `components[${i}]`]),
      );
      schema = z.tuple(componentSchemas as [z.ZodType, ...z.ZodType[]]);
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

export type PrimitiveResolver = (base: string) => string;

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

function commentFor(param: AbiParameter): string {
  const sig = canonicalType(param);
  const name = param.name ?? '';
  return name ? `/* ${name}: ${sig} */ ` : `/* ${sig} */ `;
}

export function renderSchemaSource(
  param: AbiParameter,
  resolver: PrimitiveResolver,
  indent: string = '',
  path: readonly string[] = [],
): string {
  try {
    const { base, suffixes } = parseType(param.type);
    let expr: string;
    if (base === 'tuple') {
      if (!param.components) {
        throw new Error(`tuple type missing 'components'`);
      }
      expr = renderTupleSource(param.components, resolver, indent, path);
    } else {
      expr = resolver(base);
    }
    for (const suffix of suffixes) {
      expr = suffix === null ? `z.array(${expr})` : `z.array(${expr}).length(${suffix})`;
    }
    return expr;
  } catch (err) {
    if (err instanceof BuildSchemaError) throw err;
    const where = path.length > 0 ? path.join('.') : '<root>';
    const inner = err instanceof Error ? err.message : String(err);
    throw new BuildSchemaError(
      `Failed to render schema at ${where} (type=${JSON.stringify(param.type)}, name=${JSON.stringify(param.name ?? '')}): ${inner}`,
      { cause: err },
    );
  }
}

export function renderTupleSource(
  params: readonly AbiParameter[],
  resolver: PrimitiveResolver,
  indent: string = '',
  path: readonly string[] = [],
): string {
  if (params.length === 0) return 'z.tuple([])';
  const childIndent = indent + '  ';
  const items = params.map((p, i) => {
    const expr = renderSchemaSource(p, resolver, childIndent, [...path, `components[${i}]`]);
    return `${childIndent}${commentFor(p)}${expr},`;
  });
  return `z.tuple([\n${items.join('\n')}\n${indent}])`;
}

export function collectPrimitives(params: readonly AbiParameter[]): Set<string> {
  const used = new Set<string>();
  for (const p of params) walkParam(p, used);
  return used;
}

function walkParam(param: AbiParameter, used: Set<string>): void {
  const { base } = parseType(param.type);
  if (base === 'tuple') {
    for (const c of param.components ?? []) walkParam(c, used);
  } else {
    used.add(primitiveConstName(base));
  }
}
