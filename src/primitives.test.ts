import { describe, it, expect } from 'vitest';
import { primitiveSchema } from './primitives.js';

describe('primitiveSchema: uint', () => {
  it('accepts decimal strings and emits bigint', () => {
    const s = primitiveSchema('uint256');
    expect(s.parse('0')).toBe(0n);
    expect(s.parse('1000000000000000000')).toBe(10n ** 18n);
    expect(s.parse('255')).toBe(255n);
  });

  it('rejects negative', () => {
    const s = primitiveSchema('uint256');
    expect(() => s.parse('-1')).toThrow();
  });

  it('rejects overflow', () => {
    const s = primitiveSchema('uint8');
    expect(() => s.parse('256')).toThrow();
    expect(s.parse('255')).toBe(255n);
  });

  it('uint256 accepts 2^256 - 1', () => {
    const s = primitiveSchema('uint256');
    const max = (1n << 256n) - 1n;
    expect(s.parse(max.toString())).toBe(max);
  });

  it('uint256 rejects 2^256', () => {
    const s = primitiveSchema('uint256');
    expect(() => s.parse((1n << 256n).toString())).toThrow();
  });

  it('uint alias resolves to uint256', () => {
    const s = primitiveSchema('uint');
    const max = (1n << 256n) - 1n;
    expect(s.parse(max.toString())).toBe(max);
  });

  it('rejects non-numeric strings', () => {
    const s = primitiveSchema('uint256');
    expect(() => s.parse('abc')).toThrow();
    expect(() => s.parse('0x10')).toThrow();
    expect(() => s.parse('1.5')).toThrow();
    expect(() => s.parse('')).toThrow();
  });

  it('rejects non-string input', () => {
    const s = primitiveSchema('uint256');
    expect(() => s.parse(0n)).toThrow();
    expect(() => s.parse(100)).toThrow();
    expect(() => s.parse(null)).toThrow();
  });

  it('accepts all valid widths 8..256 step 8', () => {
    for (let n = 8; n <= 256; n += 8) {
      expect(() => primitiveSchema(`uint${n}`)).not.toThrow();
    }
  });

  it('rejects invalid widths', () => {
    expect(() => primitiveSchema('uint7')).toThrow();
    expect(() => primitiveSchema('uint0')).toThrow();
    expect(() => primitiveSchema('uint264')).toThrow();
    expect(() => primitiveSchema('uint255')).toThrow();
    expect(() => primitiveSchema('uint4')).toThrow();
  });
});

describe('primitiveSchema: int', () => {
  it('accepts signed decimal and emits bigint', () => {
    const s = primitiveSchema('int256');
    expect(s.parse('-1')).toBe(-1n);
    expect(s.parse('0')).toBe(0n);
    expect(s.parse('100')).toBe(100n);
  });

  it('enforces range for int8', () => {
    const s = primitiveSchema('int8');
    expect(s.parse('127')).toBe(127n);
    expect(s.parse('-128')).toBe(-128n);
    expect(() => s.parse('128')).toThrow();
    expect(() => s.parse('-129')).toThrow();
  });

  it('int256 spans full range', () => {
    const s = primitiveSchema('int256');
    const max = (1n << 255n) - 1n;
    const min = -(1n << 255n);
    expect(s.parse(max.toString())).toBe(max);
    expect(s.parse(min.toString())).toBe(min);
    expect(() => s.parse((max + 1n).toString())).toThrow();
    expect(() => s.parse((min - 1n).toString())).toThrow();
  });

  it('int alias resolves to int256', () => {
    const s = primitiveSchema('int');
    expect(s.parse('-1')).toBe(-1n);
  });

  it('accepts all valid widths 8..256 step 8', () => {
    for (let n = 8; n <= 256; n += 8) {
      expect(() => primitiveSchema(`int${n}`)).not.toThrow();
    }
  });
});

describe('primitiveSchema: address', () => {
  const vitalik = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  it('accepts 0x + 40 hex chars (case-insensitive)', () => {
    const s = primitiveSchema('address');
    expect(s.parse(vitalik)).toBe(vitalik);
    expect(s.parse(vitalik.toLowerCase())).toBe(vitalik.toLowerCase());
    expect(s.parse(vitalik.toUpperCase().replace('0X', '0x'))).toBe(
      vitalik.toUpperCase().replace('0X', '0x'),
    );
  });

  it('rejects wrong length', () => {
    const s = primitiveSchema('address');
    expect(() => s.parse('0x1234')).toThrow();
    expect(() => s.parse('0x' + 'a'.repeat(39))).toThrow();
    expect(() => s.parse('0x' + 'a'.repeat(41))).toThrow();
  });

  it('rejects non-hex chars', () => {
    const s = primitiveSchema('address');
    expect(() => s.parse('0x' + 'g'.repeat(40))).toThrow();
  });

  it('rejects missing 0x', () => {
    const s = primitiveSchema('address');
    expect(() => s.parse('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toThrow();
  });
});

describe('primitiveSchema: bool', () => {
  it('accepts boolean values', () => {
    const s = primitiveSchema('bool');
    expect(s.parse(true)).toBe(true);
    expect(s.parse(false)).toBe(false);
  });

  it('rejects non-boolean', () => {
    const s = primitiveSchema('bool');
    expect(() => s.parse('true')).toThrow();
    expect(() => s.parse(0)).toThrow();
    expect(() => s.parse(1)).toThrow();
  });
});

describe('primitiveSchema: string', () => {
  it('accepts strings', () => {
    const s = primitiveSchema('string');
    expect(s.parse('')).toBe('');
    expect(s.parse('hello')).toBe('hello');
    expect(s.parse('🚀')).toBe('🚀');
  });

  it('rejects non-string', () => {
    const s = primitiveSchema('string');
    expect(() => s.parse(123)).toThrow();
    expect(() => s.parse(null)).toThrow();
  });
});

describe('primitiveSchema: bytes', () => {
  it('accepts empty hex', () => {
    const s = primitiveSchema('bytes');
    expect(s.parse('0x')).toBe('0x');
  });

  it('accepts even-length hex', () => {
    const s = primitiveSchema('bytes');
    expect(s.parse('0x1234')).toBe('0x1234');
    expect(s.parse('0xabcdef')).toBe('0xabcdef');
  });

  it('rejects odd-length', () => {
    const s = primitiveSchema('bytes');
    expect(() => s.parse('0x1')).toThrow();
    expect(() => s.parse('0x123')).toThrow();
  });

  it('rejects missing 0x', () => {
    const s = primitiveSchema('bytes');
    expect(() => s.parse('1234')).toThrow();
  });
});

describe('primitiveSchema: bytesN', () => {
  it('bytes32 accepts exactly 32 bytes', () => {
    const s = primitiveSchema('bytes32');
    const value = '0x' + 'a'.repeat(64);
    expect(s.parse(value)).toBe(value);
  });

  it('bytes32 rejects wrong length', () => {
    const s = primitiveSchema('bytes32');
    expect(() => s.parse('0x' + 'a'.repeat(62))).toThrow();
    expect(() => s.parse('0x' + 'a'.repeat(66))).toThrow();
    expect(() => s.parse('0x')).toThrow();
  });

  it('bytes1 accepts exactly 1 byte', () => {
    const s = primitiveSchema('bytes1');
    expect(s.parse('0xab')).toBe('0xab');
    expect(() => s.parse('0xabcd')).toThrow();
  });

  it('all widths 1..32 build successfully', () => {
    for (let n = 1; n <= 32; n++) {
      expect(() => primitiveSchema(`bytes${n}`)).not.toThrow();
    }
  });

  it('rejects out-of-range widths', () => {
    expect(() => primitiveSchema('bytes0')).toThrow();
    expect(() => primitiveSchema('bytes33')).toThrow();
  });
});

describe('primitiveSchema: rejections', () => {
  it('rejects function type', () => {
    expect(() => primitiveSchema('function')).toThrow(/function/);
  });

  it('rejects fixed-point types', () => {
    expect(() => primitiveSchema('fixed')).toThrow(/fixed-point/);
    expect(() => primitiveSchema('ufixed')).toThrow(/fixed-point/);
    expect(() => primitiveSchema('fixed128x18')).toThrow(/fixed-point/);
    expect(() => primitiveSchema('ufixed256x80')).toThrow(/fixed-point/);
  });

  it('rejects tuple (must be handled by builder)', () => {
    expect(() => primitiveSchema('tuple')).toThrow();
  });

  it('rejects unknown types', () => {
    expect(() => primitiveSchema('not_a_type')).toThrow(/Unknown/);
    expect(() => primitiveSchema('mapping')).toThrow(/Unknown/);
  });
});
