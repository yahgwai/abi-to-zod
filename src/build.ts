import { z } from 'zod';
import { parseType } from './type-parser.js';
import { primitiveSchema } from './primitives.js';

export type AbiParameter = {
  readonly type: string;
  readonly name?: string;
  readonly components?: readonly AbiParameter[];
};

export function buildSchema(param: AbiParameter): z.ZodType {
  const { base, suffixes } = parseType(param.type);

  let schema: z.ZodType;
  if (base === 'tuple') {
    if (!param.components) {
      throw new Error(
        `Tuple type missing 'components' for parameter ${JSON.stringify(param.name ?? '<anonymous>')}`,
      );
    }
    const componentSchemas = param.components.map(buildSchema);
    schema = z.tuple(componentSchemas as [z.ZodType, ...z.ZodType[]]);
  } else {
    schema = primitiveSchema(base);
  }

  for (const suffix of suffixes) {
    schema = suffix === null ? z.array(schema) : z.array(schema).length(suffix);
  }

  return schema;
}
