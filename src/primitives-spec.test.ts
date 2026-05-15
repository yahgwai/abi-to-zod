import { describe, it, expect } from 'vitest';
import { primitiveSchema, primitiveSource, primitiveSpec } from './primitives.js';

// End-to-end runtime/source equivalence per primitive variant lives in
// primitives-source.test.ts. This file pins the two things that file
// can't see:
//   1. Source format (e.g. shift expression vs resolved literal).
//   2. The value/source adjacency in BoundExpr that the spec design
//      deliberately leaves open — the one drift surface that needs a
//      direct test rather than a structural guarantee.

describe('primitiveSource: format pinning', () => {
  it('uint renders bound as a shift expression, not a resolved literal', () => {
    const src = primitiveSource('uint256');
    expect(src).toContain('n <= (1n << 256n) - 1n');
    expect(src).not.toContain(((1n << 256n) - 1n).toString());
  });

  it('int renders min and max as shift expressions', () => {
    const src = primitiveSource('int8');
    expect(src).toContain('n >= -(1n << 7n)');
    expect(src).toContain('n <= (1n << 7n) - 1n');
  });

  it('hex transforms emit the TS Hex cast', () => {
    expect(primitiveSource('address')).toContain('as `0x${string}`');
    expect(primitiveSource('bytes32')).toContain('as `0x${string}`');
  });

  it('omits regex / refine messages (matches plan output format)', () => {
    const src = primitiveSource('uint256');
    expect(src).not.toContain('Expected a decimal');
    expect(src).not.toContain('Value exceeds');
  });
});

describe('primitiveSchema: runtime keeps custom error messages', () => {
  // Counterpart to the source-format pinning above: messages live in the
  // spec, runtime consumes them, source ignores them. This pins that
  // contract so neither half silently drops messages.
  it('uint regex message survives', () => {
    const r = primitiveSchema('uint8').safeParse('abc');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Expected a decimal unsigned integer string'),
      ).toBe(true);
    }
  });

  it('uint refine message survives', () => {
    const r = primitiveSchema('uint8').safeParse('256');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Value exceeds uint8 max')).toBe(true);
    }
  });
});

describe('BoundExpr: source evaluates to value for every supported width', () => {
  // BoundExpr's value and source are stored adjacent rather than derived
  // from one form. This test forces them to agree per width — without it,
  // a typo in either field could slip past the end-to-end tests if the
  // typo happened to validate the same inputs.
  function checkBound(b: { value: bigint; source: string }) {
    const evaluated = new Function(`return ${b.source};`)() as bigint;
    expect(evaluated).toBe(b.value);
  }

  it('uintN max bound', () => {
    for (let bits = 8; bits <= 256; bits += 8) {
      const refine = primitiveSpec(`uint${bits}`).find((o) => o.op === 'refineBigIntBound');
      if (refine?.op !== 'refineBigIntBound' || !refine.max) {
        throw new Error(`uint${bits} spec missing refineBigIntBound.max`);
      }
      checkBound(refine.max);
      expect(refine.max.value).toBe((1n << BigInt(bits)) - 1n);
    }
  });

  it('intN min and max bounds', () => {
    for (let bits = 8; bits <= 256; bits += 8) {
      const refine = primitiveSpec(`int${bits}`).find((o) => o.op === 'refineBigIntBound');
      if (refine?.op !== 'refineBigIntBound' || !refine.min || !refine.max) {
        throw new Error(`int${bits} spec missing min or max`);
      }
      checkBound(refine.min);
      checkBound(refine.max);
      expect(refine.min.value).toBe(-(1n << BigInt(bits - 1)));
      expect(refine.max.value).toBe((1n << BigInt(bits - 1)) - 1n);
    }
  });
});
