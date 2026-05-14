import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { primitiveSpec, __testing } from './primitives.js';

const { specToZod, specToSource } = __testing;

// The spec refactor's whole point is that specToZod and specToSource share
// the same input. Tests here run both over targeted op combinations and
// assert agreement on runtime behaviour for representative inputs. End-to-
// end tests in primitives-source.test.ts cover full fixture coverage; this
// file pins the interpreters at the Op level so a divergence shows up
// directly, not just via the equivalence harness.

function evalSrc(src: string): z.ZodType {
  const stripped = src.replace(/ as `0x\$\{string\}`/g, '');
  return new Function('z', `return ${stripped}`)(z) as z.ZodType;
}

function expectSame(spec: Parameters<typeof specToZod>[0], inputs: readonly unknown[]) {
  const zod = specToZod(spec);
  const fromSource = evalSrc(specToSource(spec));
  for (const v of inputs) {
    const a = zod.safeParse(v);
    const b = fromSource.safeParse(v);
    expect(b.success, `disagreement on ${typeof v === 'bigint' ? `${v}n` : JSON.stringify(v)}`).toBe(
      a.success,
    );
    if (a.success && b.success) expect(b.data).toEqual(a.data);
  }
}

describe('Op: string', () => {
  it('both interpreters produce a bare string schema', () => {
    expectSame([{ op: 'string' }], ['', 'hi', '🚀', 0, null, undefined]);
  });
});

describe('Op: boolean', () => {
  it('both interpreters produce a boolean schema', () => {
    expectSame([{ op: 'boolean' }], [true, false, 'true', 0, 1, null]);
  });
});

describe('Op: regex', () => {
  it('applies the regex consistently', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^[a-z]+$/ },
      ],
      ['abc', 'ABC', '', '123', 'a1b2'],
    );
  });

  it('regex with anchors and groups', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^0x([0-9a-fA-F]{2})*$/ },
      ],
      ['0x', '0x12', '0xabcd', '0xZZ', 'abcd', '0x1'],
    );
  });

  it('runtime path attaches message; source path omits it (by design)', () => {
    const spec = [
      { op: 'string' } as const,
      { op: 'regex', pattern: /^\d+$/, message: 'custom message' } as const,
    ];
    const zod = specToZod(spec);
    const r = zod.safeParse('abc');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'custom message')).toBe(true);
    }
    // Source-side intentionally drops the message — it appears in the
    // generated file as `.regex(/^\d+$/)`, no second arg.
    expect(specToSource(spec)).toBe(`z.string().regex(/^\\d+$/)`);
  });
});

describe('Op: transformBigInt', () => {
  it('produces a bigint and accepts the same inputs', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^-?\d+$/ },
        { op: 'transformBigInt' },
      ],
      ['0', '1', '-1', '1000', 'abc', '1.5', '', null],
    );
  });
});

describe('Op: transformHex', () => {
  it('passes the string through (cast is type-level only)', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^0x[0-9a-fA-F]+$/ },
        { op: 'transformHex' },
      ],
      ['0xab', '0x1234', '0x', 'abcd', '0xZZ'],
    );
  });

  it('source emits the TS Hex cast', () => {
    const src = specToSource([
      { op: 'string' },
      { op: 'regex', pattern: /^0x[0-9a-fA-F]+$/ },
      { op: 'transformHex' },
    ]);
    expect(src).toContain('as `0x${string}`');
  });
});

describe('Op: refineBigIntBound', () => {
  it('enforces max only', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^\d+$/ },
        { op: 'transformBigInt' },
        {
          op: 'refineBigIntBound',
          max: { value: 255n, source: '255n' },
        },
      ],
      ['0', '100', '255', '256', '1000'],
    );
  });

  it('enforces min only', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^-?\d+$/ },
        { op: 'transformBigInt' },
        {
          op: 'refineBigIntBound',
          min: { value: -128n, source: '-128n' },
        },
      ],
      ['-128', '-129', '0', '500'],
    );
  });

  it('enforces both min and max', () => {
    expectSame(
      [
        { op: 'string' },
        { op: 'regex', pattern: /^-?\d+$/ },
        { op: 'transformBigInt' },
        {
          op: 'refineBigIntBound',
          min: { value: -128n, source: '-128n' },
          max: { value: 127n, source: '127n' },
        },
      ],
      ['-128', '127', '-129', '128', '0'],
    );
  });

  it('renders bound source verbatim', () => {
    const src = specToSource([
      { op: 'string' },
      { op: 'regex', pattern: /^\d+$/ },
      { op: 'transformBigInt' },
      {
        op: 'refineBigIntBound',
        max: { value: (1n << 256n) - 1n, source: '(1n << 256n) - 1n' },
      },
    ]);
    expect(src).toContain('n <= (1n << 256n) - 1n');
    // Bound source is preserved literally — not collapsed to the resolved
    // bigint, so generated output stays readable for wide types.
    expect(src).not.toContain('115792089237316195423570985008687907853269984665640564039457584007913129639935');
  });
});

describe('BoundExpr consistency for built-in primitives', () => {
  // Single source of truth: spec generators build value+source together.
  // Cross-check each width's bound resolves to the same number both ways.
  it('uintN bound value matches uintN source', () => {
    for (let bits = 8; bits <= 256; bits += 8) {
      const spec = primitiveSpec(`uint${bits}`);
      const refine = spec.find((o) => o.op === 'refineBigIntBound');
      expect(refine).toBeDefined();
      if (refine?.op !== 'refineBigIntBound' || !refine.max) return;
      const evaluated = new Function(`return ${refine.max.source};`)() as bigint;
      expect(evaluated).toBe(refine.max.value);
      expect(refine.max.value).toBe((1n << BigInt(bits)) - 1n);
    }
  });

  it('intN min/max bound values match their source expressions', () => {
    for (let bits = 8; bits <= 256; bits += 8) {
      const spec = primitiveSpec(`int${bits}`);
      const refine = spec.find((o) => o.op === 'refineBigIntBound');
      if (refine?.op !== 'refineBigIntBound') return;
      const min = refine.min;
      const max = refine.max;
      expect(min).toBeDefined();
      expect(max).toBeDefined();
      if (!min || !max) return;
      expect(new Function(`return ${min.source};`)()).toBe(min.value);
      expect(new Function(`return ${max.source};`)()).toBe(max.value);
      expect(min.value).toBe(-(1n << BigInt(bits - 1)));
      expect(max.value).toBe((1n << BigInt(bits - 1)) - 1n);
    }
  });
});

describe('Spec composition matches end-to-end primitive behaviour', () => {
  // If specToZod or specToSource ever diverges on a real primitive, this
  // catches it at the spec-composition level without going through the
  // larger ABI walker.
  const cases: readonly string[] = [
    'uint256',
    'uint8',
    'uint',
    'int256',
    'int8',
    'int',
    'address',
    'bool',
    'string',
    'bytes',
    'bytes32',
    'bytes1',
  ];
  for (const base of cases) {
    it(`${base}: spec compiles consistently in both interpreters`, () => {
      const spec = primitiveSpec(base);
      expectSame(spec, [
        'x',
        '',
        '0',
        '-1',
        '0x',
        '0xab',
        '0x' + 'a'.repeat(40),
        '0x' + 'a'.repeat(64),
        true,
        false,
        null,
        100,
      ]);
    });
  }
});
