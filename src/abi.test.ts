import { describe, it, expect } from 'vitest';
import { abiToZod, canonicalSignature, type Abi } from './abi.js';

const simpleAbi: Abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
  },
];

const overloadedAbi: Abi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'a', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'a', type: 'address' }],
  },
  {
    type: 'function',
    name: 'bar',
    inputs: [],
  },
];

describe('canonicalSignature', () => {
  it('formats primitive args', () => {
    expect(
      canonicalSignature({
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      }),
    ).toBe('transfer(address,uint256)');
  });

  it('normalizes uint/int aliases', () => {
    expect(
      canonicalSignature({
        type: 'function',
        name: 'foo',
        inputs: [
          { name: 'a', type: 'uint' },
          { name: 'b', type: 'int' },
        ],
      }),
    ).toBe('foo(uint256,int256)');
  });

  it('expands tuples', () => {
    expect(
      canonicalSignature({
        type: 'function',
        name: 'place',
        inputs: [
          {
            name: 'order',
            type: 'tuple',
            components: [
              { name: 'maker', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      }),
    ).toBe('place((address,uint256))');
  });

  it('expands tuples with array suffix', () => {
    expect(
      canonicalSignature({
        type: 'function',
        name: 'batch',
        inputs: [
          {
            name: 'orders',
            type: 'tuple[]',
            components: [{ name: 'a', type: 'uint256' }],
          },
        ],
      }),
    ).toBe('batch((uint256)[])');
  });

  it('nests tuples', () => {
    expect(
      canonicalSignature({
        type: 'function',
        name: 'deep',
        inputs: [
          {
            name: 'x',
            type: 'tuple',
            components: [
              {
                name: 'inner',
                type: 'tuple',
                components: [{ name: 'a', type: 'bool' }],
              },
              { name: 'outer', type: 'address' },
            ],
          },
        ],
      }),
    ).toBe('deep(((bool),address))');
  });
});

describe('abiToZod', () => {
  it('resolves unambiguous name', () => {
    const s = abiToZod(simpleAbi, 'transfer');
    expect(s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100'])).toEqual([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      100n,
    ]);
  });

  it('resolves explicit signature', () => {
    const s = abiToZod(simpleAbi, 'balanceOf(address)');
    expect(s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])).toEqual([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ]);
  });

  it('throws on unknown name', () => {
    expect(() => abiToZod(simpleAbi, 'unknown')).toThrow(/No function named/);
  });

  it('throws on unknown signature', () => {
    expect(() => abiToZod(simpleAbi, 'transfer(uint256)')).toThrow(/No function found/);
  });

  it('throws on ambiguous name', () => {
    expect(() => abiToZod(overloadedAbi, 'foo')).toThrow(/Ambiguous/);
  });

  it('resolves overloads via full signature', () => {
    const sUint = abiToZod(overloadedAbi, 'foo(uint256)');
    const sAddr = abiToZod(overloadedAbi, 'foo(address)');
    expect(sUint.parse(['42'])).toEqual([42n]);
    expect(sAddr.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])).toEqual([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ]);
  });

  it('normalizes uint alias in query signature', () => {
    const abi: Abi = [{ type: 'function', name: 'foo', inputs: [{ name: 'a', type: 'uint256' }] }];
    const s = abiToZod(abi, 'foo(uint)');
    expect(s.parse(['1'])).toEqual([1n]);
  });

  it('ignores non-function entries (events, etc.)', () => {
    expect(() => abiToZod(simpleAbi, 'Transfer')).toThrow(/No function named/);
  });

  it('handles zero-input functions via signature', () => {
    const s = abiToZod(overloadedAbi, 'bar()');
    expect(s.parse([])).toEqual([]);
  });

  it('throws on function entries with missing inputs', () => {
    const abi = [{ type: 'function', name: 'foo' }] as unknown as Abi;
    expect(() => abiToZod(abi, 'foo')).toThrow(/inputs/);
  });

  it('throws on function entries with non-string name', () => {
    const abi = [{ type: 'function', inputs: [] }] as unknown as Abi;
    expect(() => abiToZod(abi, 'anything')).toThrow(/name/);
  });

  it('failure surfaces immediately, not silently dropped', () => {
    const abi = [
      { type: 'function', name: 'good', inputs: [] },
      { type: 'function', name: 'bad' },
    ] as unknown as Abi;
    expect(() => abiToZod(abi, 'good')).toThrow(/bad.*inputs/);
  });
});
