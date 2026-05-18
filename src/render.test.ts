import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildParamSchema, type AbiParameter } from './build.js';
import {
  collectPrimitives,
  renderParamSchema,
  renderSchemas,
  renderTupleSchema,
} from './render.js';
import { buildSchemas, canonicalSignature, filterFunctions, type Abi } from './schemas.js';
import { primitiveConstName, primitiveSource } from './primitives.js';
import { placeholderFor } from './test-helpers.js';
import { FIXTURES, arbInfoAbi, erc20Abi } from '../test/fixtures/index.js';

// Build a "consts" object so eval'd source can resolve UINT256/etc. as locals.
function evalRenderedTuple(params: readonly AbiParameter[]): z.ZodType {
  const used = collectPrimitives(params);
  const constDecls = [...used]
    .sort()
    .map((c) => {
      const base = constNameToBase(c);
      const src = primitiveSource(base).replace(/ as `0x\$\{string\}`/g, '');
      return `const ${c} = ${src};`;
    })
    .join('\n');
  const body = renderTupleSchema(params, primitiveConstName).replace(
    / as `0x\$\{string\}`/g,
    '',
  );
  return new Function('z', `${constDecls}\nreturn ${body};`)(z) as z.ZodType;
}

function constNameToBase(name: string): string {
  if (name === 'ADDRESS') return 'address';
  if (name === 'BOOL') return 'bool';
  if (name === 'STRING') return 'string';
  if (name === 'BYTES') return 'bytes';
  const um = /^UINT(\d+)$/.exec(name);
  if (um) return `uint${um[1]}`;
  const im = /^INT(\d+)$/.exec(name);
  if (im) return `int${im[1]}`;
  const bm = /^BYTES(\d+)$/.exec(name);
  if (bm) return `bytes${bm[1]}`;
  throw new Error(`unknown const name ${name}`);
}

// Mirror buildFunctionInputsSchema: wrap params in a top-level tuple
// without object-ifying — only nested struct components become objects.
// Wrapping as a tuple-typed AbiParameter would collapse the two layers.
function asFunctionInputs(params: AbiParameter[]): z.ZodType {
  const items = params.map((p) => buildParamSchema(p));
  return z.tuple(items as [z.ZodType, ...z.ZodType[]]);
}

function expectSameParse(params: AbiParameter[], inputs: unknown) {
  const runtime = asFunctionInputs(params);
  const generated = evalRenderedTuple(params);
  const a = runtime.safeParse(inputs);
  const b = generated.safeParse(inputs);
  expect(b.success).toBe(a.success);
  if (a.success) expect(b.success && b.data).toEqual(a.data);
}

describe('renderTupleSchema: equivalence with buildParamSchema', () => {
  it('flat tuple of primitives', () => {
    const params: AbiParameter[] = [
      { type: 'address', name: 'who' },
      { type: 'uint256', name: 'amount' },
    ];
    expectSameParse(params, ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100']);
    expectSameParse(params, ['not-an-address', '100']);
  });

  it('nested all-named tuple', () => {
    const params: AbiParameter[] = [
      {
        type: 'tuple',
        name: 'inner',
        components: [
          { type: 'uint256', name: 'a' },
          { type: 'bool', name: 'b' },
        ],
      },
      { type: 'address', name: 'c' },
    ];
    expectSameParse(params, [
      { a: '5', b: true },
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ]);
  });

  it('dynamic array of uint256', () => {
    const params: AbiParameter[] = [{ type: 'uint256[]', name: 'amounts' }];
    expectSameParse(params, [['1', '2', '3']]);
    expectSameParse(params, [[]]);
  });

  it('fixed array of uint64', () => {
    const params: AbiParameter[] = [{ type: 'uint64[2]', name: 'pair' }];
    expectSameParse(params, [['10', '20']]);
    expectSameParse(params, [['10']]);
  });

  it('nested fixed + dynamic', () => {
    const params: AbiParameter[] = [{ type: 'uint64[3][]', name: 'rows' }];
    expectSameParse(params, [[['1', '2', '3'], ['4', '5', '6']]]);
    expectSameParse(params, [[['1', '2']]]);
  });

  it('array of all-named tuples', () => {
    const params: AbiParameter[] = [
      {
        type: 'tuple[]',
        name: 'pairs',
        components: [
          { type: 'address', name: 'who' },
          { type: 'uint256', name: 'amount' },
        ],
      },
    ];
    expectSameParse(params, [
      [
        { who: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', amount: '10' },
        { who: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', amount: '20' },
      ],
    ]);
  });

  it('all-named tuple containing array', () => {
    const params: AbiParameter[] = [
      {
        type: 'tuple',
        name: 'withList',
        components: [
          { type: 'uint256[]', name: 'xs' },
          { type: 'address', name: 'owner' },
        ],
      },
    ];
    expectSameParse(params, [
      { xs: ['1', '2'], owner: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
    ]);
  });

  it('empty tuple', () => {
    expect(renderTupleSchema([], primitiveConstName)).toBe('z.tuple([])');
  });
});

describe('renderParamSchema: shape', () => {
  it('primitive resolves to const name', () => {
    expect(renderParamSchema({ type: 'uint256' }, primitiveConstName)).toBe('UINT256');
  });

  it('uint alias normalizes to UINT256', () => {
    expect(renderParamSchema({ type: 'uint' }, primitiveConstName)).toBe('UINT256');
  });

  it('dynamic array wraps in z.array', () => {
    expect(renderParamSchema({ type: 'uint256[]' }, primitiveConstName)).toBe(
      'z.array(UINT256)',
    );
  });

  it('fixed array uses .length()', () => {
    expect(renderParamSchema({ type: 'uint256[3]' }, primitiveConstName)).toBe(
      'z.array(UINT256).length(3)',
    );
  });

  it('nested array of fixed array', () => {
    expect(renderParamSchema({ type: 'uint256[3][]' }, primitiveConstName)).toBe(
      'z.array(z.array(UINT256).length(3))',
    );
  });
});

describe('collectPrimitives', () => {
  it('collects unique primitive const names', () => {
    const used = collectPrimitives([
      { type: 'address', name: 'a' },
      { type: 'uint256', name: 'b' },
      { type: 'uint256[]', name: 'c' },
      {
        type: 'tuple',
        name: 'd',
        components: [
          { type: 'bool', name: 'x' },
          { type: 'address', name: 'y' },
        ],
      },
    ]);
    expect([...used].sort()).toEqual(['ADDRESS', 'BOOL', 'UINT256']);
  });

  it('normalizes uint/int aliases', () => {
    const used = collectPrimitives([
      { type: 'uint' },
      { type: 'int' },
    ]);
    expect([...used].sort()).toEqual(['INT256', 'UINT256']);
  });

  it('handles empty params', () => {
    expect(collectPrimitives([]).size).toBe(0);
  });
});

function evalGenerated(source: string): {
  schemas: Record<string, z.ZodType>;
} {
  // Strip the import (we inject z below), drop TS-only assertions, and remove
  // `export`/`as const` so the source runs as plain JS and exposes `schemas`.
  const js = source
    .replace(/^import \{ z \} from 'zod';\n/m, '')
    .replace(/ as `0x\$\{string\}`/g, '');
  const noExports = js.replace(/^export const /gm, 'const ');
  const noAsConst = noExports.replace(/\}\s*as\s+const;/g, '};');
  const fn = new Function('z', `${noAsConst}\nreturn schemas;`);
  const schemas = fn(z) as Record<string, z.ZodType>;
  return { schemas };
}

describe('renderSchemas: equivalence with buildSchemas', () => {
  for (const [rel, abi] of Object.entries(FIXTURES)) {
    it(`fixture ${rel}: generated schemas match runtime parse output`, () => {
      const source = renderSchemas(abi, rel.split('/').pop() ?? rel);
      const { schemas } = evalGenerated(source);
      const fns = filterFunctions(abi);
      for (const f of fns) {
        const sig = canonicalSignature(f);
        const generated = schemas[sig];
        expect(generated, `table missing signature key ${sig}`).toBeDefined();
        if (!generated) continue;

        let input: unknown[];
        try {
          input = f.inputs.map(placeholderFor);
        } catch {
          // placeholderFor throws on unsupported types; no fixture hits this today.
          continue;
        }

        const runtime = (buildSchemas(abi) as Record<string, z.ZodType<unknown> | undefined>)[sig];
        expect(runtime, `runtime table missing signature key ${sig}`).toBeDefined();
        if (!runtime) continue;
        const a = runtime.safeParse(input);
        const b = generated.safeParse(input);
        expect(b.success, `parse mismatch for ${rel}:${sig}`).toBe(a.success);
        if (a.success && b.success) {
          expect(b.data).toEqual(a.data);
        }
      }
    });
  }
});

describe('renderSchemas: header and structure', () => {
  it('emits header with version and source name', () => {
    const abi = [
      {
        type: 'function',
        name: 'foo',
        inputs: [{ type: 'uint256', name: 'x' }],
      },
    ];
    const src = renderSchemas(abi as unknown as Abi, 'Foo.json');
    expect(src).toMatch(/^\/\/ Generated by abi-to-zod v.+ from Foo\.json/);
    expect(src).toContain('// Do not edit manually');
    expect(src).toContain(`import { z } from 'zod';`);
  });

  it('falls back to (unnamed) when no source name given', () => {
    const src = renderSchemas([], undefined);
    expect(src).toContain('from (unnamed)');
  });

  it('emits per-function export for unambiguous names', () => {
    const abi = [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'value' },
        ],
      },
    ];
    const src = renderSchemas(abi as unknown as Abi, 'x');
    expect(src).toContain('export const transferSchema = z.tuple([');
    expect(src).toContain('transfer: transferSchema');
    expect(src).toContain(`'transfer(address,uint256)': transferSchema`);
  });

  it('omits per-function export for overloaded names; inlines in table by signature only', () => {
    const abi = [
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { type: 'address', name: 'from' },
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'tokenId' },
        ],
      },
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { type: 'address', name: 'from' },
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'tokenId' },
          { type: 'bytes', name: 'data' },
        ],
      },
    ];
    const src = renderSchemas(abi as unknown as Abi, 'x');
    expect(src).not.toContain('export const safeTransferFromSchema');
    expect(src).not.toMatch(/^ {2}safeTransferFrom:/m);
    expect(src).toContain(`'safeTransferFrom(address,address,uint256)':`);
    expect(src).toContain(`'safeTransferFrom(address,address,uint256,bytes)':`);
  });

  it('only emits primitive consts that are actually used', () => {
    const abi = [
      {
        type: 'function',
        name: 'pingAddress',
        inputs: [{ type: 'address', name: 'a' }],
      },
    ];
    const src = renderSchemas(abi as unknown as Abi, 'x');
    expect(src).toContain('const ADDRESS =');
    expect(src).not.toContain('const UINT256 =');
    expect(src).not.toContain('const BOOL =');
  });

  it('skips non-function entries', () => {
    const abi = [
      { type: 'event', name: 'Transfer', inputs: [{ type: 'address', name: 'a' }] } as never,
      {
        type: 'function',
        name: 'name',
        inputs: [],
      },
    ];
    const src = renderSchemas(abi as unknown as Abi, 'x');
    expect(src).toContain('export const nameSchema');
    expect(src).not.toContain('TransferSchema');
  });

  it('is deterministic: same ABI -> identical bytes', () => {
    const abi = [
      {
        type: 'function',
        name: 'foo',
        inputs: [{ type: 'uint256', name: 'a' }],
      },
      {
        type: 'function',
        name: 'bar',
        inputs: [{ type: 'address', name: 'b' }],
      },
    ];
    expect(renderSchemas(abi as unknown as Abi, 'x')).toBe(renderSchemas(abi as unknown as Abi, 'x'));
  });
});

describe('renderSchemas: snapshot small fixtures', () => {
  const small: ReadonlyArray<readonly [string, Abi]> = [
    ['erc/ERC20.ts', erc20Abi],
    ['arbitrum/precompiles/ArbInfo.ts', arbInfoAbi],
  ];
  for (const [rel, abi] of small) {
    it(`snapshot: ${rel}`, () => {
      const src = renderSchemas(abi, rel.split('/').pop() ?? rel);
      expect(src).toMatchSnapshot();
    });
  }
});
