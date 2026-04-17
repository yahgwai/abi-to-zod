import { describe, it, expect } from 'vitest';
import { buildSchema } from './build.js';

describe('buildSchema: primitives', () => {
  it('builds a schema for a uint256', () => {
    const s = buildSchema({ type: 'uint256', name: 'x' });
    expect(s.parse('42')).toBe(42n);
  });

  it('builds a schema for an address', () => {
    const s = buildSchema({ type: 'address', name: 'who' });
    const a = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    expect(s.parse(a)).toBe(a);
  });
});

describe('buildSchema: arrays', () => {
  it('dynamic array of uint256', () => {
    const s = buildSchema({ type: 'uint256[]', name: 'amounts' });
    expect(s.parse(['1', '2', '3'])).toEqual([1n, 2n, 3n]);
    expect(s.parse([])).toEqual([]);
  });

  it('fixed-size array of uint64', () => {
    const s = buildSchema({ type: 'uint64[2]', name: 'pair' });
    expect(s.parse(['10', '20'])).toEqual([10n, 20n]);
    expect(() => s.parse(['10'])).toThrow();
    expect(() => s.parse(['10', '20', '30'])).toThrow();
  });

  it('nested fixed + dynamic', () => {
    const s = buildSchema({ type: 'uint64[3][]', name: 'rows' });
    expect(s.parse([])).toEqual([]);
    expect(s.parse([['1', '2', '3'], ['4', '5', '6']])).toEqual([
      [1n, 2n, 3n],
      [4n, 5n, 6n],
    ]);
    expect(() => s.parse([['1', '2']])).toThrow();
  });

  it('bytes32 array', () => {
    const s = buildSchema({ type: 'bytes32[]', name: 'hashes' });
    const h = '0x' + 'a'.repeat(64);
    expect(s.parse([h, h])).toEqual([h, h]);
  });
});

describe('buildSchema: tuples', () => {
  it('tuple with primitive components yields positional tuple', () => {
    const s = buildSchema({
      type: 'tuple',
      name: 'pair',
      components: [
        { type: 'address', name: 'who' },
        { type: 'uint256', name: 'amount' },
      ],
    });
    const out = s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100']);
    expect(out).toEqual(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n]);
  });

  it('tuple without components throws', () => {
    expect(() => buildSchema({ type: 'tuple', name: 'bad' })).toThrow(/components/);
  });

  it('nested tuple', () => {
    const s = buildSchema({
      type: 'tuple',
      name: 'outer',
      components: [
        {
          type: 'tuple',
          name: 'inner',
          components: [
            { type: 'uint256', name: 'a' },
            { type: 'bool', name: 'b' },
          ],
        },
        { type: 'address', name: 'c' },
      ],
    });
    const out = s.parse([['5', true], '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']);
    expect(out).toEqual([[5n, true], '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']);
  });

  it('tuple containing array', () => {
    const s = buildSchema({
      type: 'tuple',
      name: 'withList',
      components: [
        { type: 'uint256[]', name: 'xs' },
        { type: 'address', name: 'owner' },
      ],
    });
    const out = s.parse([['1', '2'], '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']);
    expect(out).toEqual([[1n, 2n], '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']);
  });

  it('array of tuples (tuple[])', () => {
    const s = buildSchema({
      type: 'tuple[]',
      name: 'pairs',
      components: [
        { type: 'address', name: 'who' },
        { type: 'uint256', name: 'amount' },
      ],
    });
    const input = [
      ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '10'],
      ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '20'],
    ];
    const out = s.parse(input);
    expect(out).toEqual([
      ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 10n],
      ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 20n],
    ]);
  });

  it('fixed-size array of tuples (tuple[2])', () => {
    const s = buildSchema({
      type: 'tuple[2]',
      name: 'pair',
      components: [{ type: 'uint256', name: 'v' }],
    });
    expect(s.parse([['1'], ['2']])).toEqual([[1n], [2n]]);
    expect(() => s.parse([['1']])).toThrow();
  });

  it('2D array of tuples (tuple[][])', () => {
    const s = buildSchema({
      type: 'tuple[][]',
      name: 'grid',
      components: [{ type: 'bool', name: 'b' }],
    });
    expect(s.parse([[[true], [false]], []])).toEqual([[[true], [false]], []]);
  });

  it('empty tuple (no components) is allowed', () => {
    const s = buildSchema({ type: 'tuple', name: 'empty', components: [] });
    expect(s.parse([])).toEqual([]);
  });
});

describe('buildSchema: rejections', () => {
  it('propagates primitive rejections (function)', () => {
    expect(() => buildSchema({ type: 'function', name: 'f' })).toThrow(/function/);
  });

  it('propagates primitive rejections (fixed)', () => {
    expect(() => buildSchema({ type: 'fixed128x18', name: 'f' })).toThrow(/fixed-point/);
  });

  it('propagates type-parser rejections', () => {
    expect(() => buildSchema({ type: 'uint256[0]', name: 'f' })).toThrow(/size 0/);
  });
});
