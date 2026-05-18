import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildParamSchema, type AbiParameter } from './build.js';
import {
  renderParamSchema,
  renderTupleSource,
  collectPrimitives,
} from './render.js';
import { primitiveSource, primitiveConstName } from './primitives.js';

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
  const body = renderTupleSource(params, primitiveConstName).replace(
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

describe('renderTupleSource: equivalence with buildParamSchema', () => {
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
    expect(renderTupleSource([], primitiveConstName)).toBe('z.tuple([])');
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
