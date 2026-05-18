import { describe, it, expect } from 'vitest';
import type { Abi } from 'abitype';
import { buildSchemas, canonicalSignature } from './abi.js';

const simpleAbi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
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
] as const satisfies Abi;

const overloadedAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'a', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'bar',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi;

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

describe('buildSchemas table', () => {
  it('exposes name keys for unambiguous functions', () => {
    const table = buildSchemas(simpleAbi);
    const transfer = table.transfer;
    expect(transfer).toBeDefined();
    expect(transfer!.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100'])).toEqual([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      100n,
    ]);
  });

  it('exposes signature keys for every function', () => {
    const table = buildSchemas(simpleAbi);
    const balanceOf = table['balanceOf(address)'];
    expect(balanceOf).toBeDefined();
    expect(balanceOf!.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])).toEqual([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ]);
  });

  it('returns undefined for unknown name or signature', () => {
    // The typed SchemaTable rejects unknown keys at compile time. The runtime
    // test below is the safety net proving no stray props slipped in;
    // casting widens the read but the runtime shape is what we're asserting.
    const table = buildSchemas(simpleAbi) as Record<string, unknown>;
    expect(table['unknown']).toBeUndefined();
    expect(table['transfer(uint256)']).toBeUndefined();
  });

  it('omits the name key when overloaded, but keeps both signature keys', () => {
    const table = buildSchemas(overloadedAbi);
    expect((table as Record<string, unknown>)['foo']).toBeUndefined();
    expect(table['foo(uint256)']).toBeDefined();
    expect(table['foo(address)']).toBeDefined();
    expect(table['foo(uint256)']!.parse(['42'])).toEqual([42n]);
    expect(table['foo(address)']!.parse([
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    ])).toEqual(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']);
  });

  it('ignores non-function entries (events, etc.)', () => {
    const table = buildSchemas(simpleAbi) as Record<string, unknown>;
    expect(table['Transfer']).toBeUndefined();
  });

  it('handles zero-input functions via signature', () => {
    const table = buildSchemas(overloadedAbi);
    expect(table['bar()']).toBeDefined();
    expect(table.bar).toBeDefined();
    expect(table.bar!.parse([])).toEqual([]);
  });

  it('throws on function entries with missing inputs', () => {
    const abi = [{ type: 'function', name: 'foo' }] as unknown as Abi;
    expect(() => buildSchemas(abi)).toThrow(/inputs/);
  });

  it('throws on function entries with non-string name', () => {
    const abi = [{ type: 'function', inputs: [] }] as unknown as Abi;
    expect(() => buildSchemas(abi)).toThrow(/name/);
  });

  it('failure surfaces immediately, not silently dropped', () => {
    const abi = [
      { type: 'function', name: 'good', inputs: [] },
      { type: 'function', name: 'bad' },
    ] as unknown as Abi;
    expect(() => buildSchemas(abi)).toThrow(/bad.*inputs/);
  });
});
