import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { primitiveSchema, primitiveSource } from './primitives.js';

// Strip TS-only type assertions so the source can be evaluated as plain JS.
function evalSource(source: string): z.ZodType {
  const stripped = source.replace(/ as `0x\$\{string\}`/g, '');
  return new Function('z', `return ${stripped}`)(z) as z.ZodType;
}

function safeParse(s: z.ZodType, v: unknown): { ok: boolean; out?: unknown } {
  const r = s.safeParse(v);
  return r.success ? { ok: true, out: r.data } : { ok: false };
}

function display(v: unknown): string {
  if (typeof v === 'bigint') return `${v}n`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function expectEquivalent(base: string, inputs: readonly unknown[]) {
  const runtime = primitiveSchema(base);
  const generated = evalSource(primitiveSource(base));
  for (const v of inputs) {
    const a = safeParse(runtime, v);
    const b = safeParse(generated, v);
    expect(b.ok, `mismatch on ${base} for ${display(v)}`).toBe(a.ok);
    if (a.ok) expect(b.out).toEqual(a.out);
  }
}

describe('primitiveSource: uint', () => {
  it('uint256 matches schema runtime', () => {
    expectEquivalent('uint256', [
      '0',
      '1',
      '255',
      '1000000000000000000',
      ((1n << 256n) - 1n).toString(),
      (1n << 256n).toString(),
      '-1',
      'abc',
      '1.5',
      '',
      null,
      0n,
      100,
    ]);
  });

  it('uint8 enforces width', () => {
    expectEquivalent('uint8', ['0', '255', '256', '-1', '128']);
  });

  it('uint alias = uint256', () => {
    expectEquivalent('uint', ['0', ((1n << 256n) - 1n).toString(), (1n << 256n).toString()]);
  });
});

describe('primitiveSource: int', () => {
  it('int256 matches schema runtime', () => {
    expectEquivalent('int256', [
      '0',
      '-1',
      '1',
      ((1n << 255n) - 1n).toString(),
      (-(1n << 255n)).toString(),
      (1n << 255n).toString(),
      (-(1n << 255n) - 1n).toString(),
      'abc',
    ]);
  });

  it('int8 enforces range', () => {
    expectEquivalent('int8', ['127', '-128', '128', '-129', '0']);
  });

  it('int alias = int256', () => {
    expectEquivalent('int', ['0', '-1']);
  });
});

describe('primitiveSource: address', () => {
  it('matches schema runtime', () => {
    expectEquivalent('address', [
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '0x0000000000000000000000000000000000000000',
      '0x' + 'a'.repeat(39),
      '0x' + 'a'.repeat(41),
      '0x' + 'g'.repeat(40),
      'd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '',
      null,
    ]);
  });
});

describe('primitiveSource: bool', () => {
  it('matches schema runtime', () => {
    expectEquivalent('bool', [true, false, 'true', 0, 1, null]);
  });
});

describe('primitiveSource: string', () => {
  it('matches schema runtime', () => {
    expectEquivalent('string', ['', 'hi', '🚀', 0, null, undefined]);
  });
});

describe('primitiveSource: bytes', () => {
  it('matches schema runtime', () => {
    expectEquivalent('bytes', ['0x', '0x12', '0xabcd', '0x1', '1234', '0xZZ']);
  });
});

describe('primitiveSource: bytesN', () => {
  it('bytes32 matches schema runtime', () => {
    expectEquivalent('bytes32', ['0x' + 'a'.repeat(64), '0x' + 'a'.repeat(62), '0x']);
  });

  it('bytes1 matches schema runtime', () => {
    expectEquivalent('bytes1', ['0xab', '0xabcd', '0x']);
  });
});

describe('primitiveSource: all widths build', () => {
  it('all uint widths 8..256 build & match', () => {
    for (let n = 8; n <= 256; n += 8) {
      expectEquivalent(`uint${n}`, ['0', '1']);
    }
  });

  it('all int widths 8..256 build & match', () => {
    for (let n = 8; n <= 256; n += 8) {
      expectEquivalent(`int${n}`, ['0', '1', '-1']);
    }
  });

  it('all bytesN widths 1..32 build & match', () => {
    for (let n = 1; n <= 32; n++) {
      expectEquivalent(`bytes${n}`, ['0x' + 'a'.repeat(2 * n)]);
    }
  });
});
