import { parseType } from './type-parser.js';
import { primitiveConstName } from './primitives.js';
import {
  type AbiParameter,
  BuildSchemaError,
  canonicalType,
  pickNamedComponents,
} from './build.js';

export type PrimitiveResolver = (base: string) => string;

function commentFor(param: AbiParameter): string {
  const sig = canonicalType(param);
  const name = param.name ?? '';
  return name ? `/* ${name}: ${sig} */ ` : `/* ${sig} */ `;
}

export function renderParamSchema(
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
      const named = pickNamedComponents(param.components);
      expr = named
        ? renderObjectSchema(named, resolver, indent, path)
        : renderTupleSchema(param.components, resolver, indent, path);
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

export function renderTupleSchema(
  params: readonly AbiParameter[],
  resolver: PrimitiveResolver,
  indent: string = '',
  path: readonly string[] = [],
): string {
  if (params.length === 0) return 'z.tuple([])';
  const childIndent = indent + '  ';
  const items = params.map((p, i) => {
    const expr = renderParamSchema(p, resolver, childIndent, [...path, `components[${i}]`]);
    return `${childIndent}${commentFor(p)}${expr},`;
  });
  return `z.tuple([\n${items.join('\n')}\n${indent}])`;
}

export function renderObjectSchema(
  named: readonly (readonly [string, AbiParameter])[],
  resolver: PrimitiveResolver,
  indent: string = '',
  path: readonly string[] = [],
): string {
  const childIndent = indent + '  ';
  const items = named.map(([name, param], i) => {
    const expr = renderParamSchema(param, resolver, childIndent, [...path, `components[${i}]`]);
    return `${childIndent}${name}: ${expr},`;
  });
  return `z.strictObject({\n${items.join('\n')}\n${indent}})`;
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
