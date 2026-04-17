import { describe, it, expect } from 'vitest';
import { abiFunctionToZod } from './function.js';

describe('abiFunctionToZod', () => {
  it('handles a no-arg function', () => {
    const s = abiFunctionToZod({ type: 'function', name: 'totalSupply', inputs: [] });
    expect(s.parse([])).toEqual([]);
  });

  it('handles a function with primitive inputs', () => {
    const s = abiFunctionToZod({
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
    });
    const out = s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100']);
    expect(out).toEqual(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n]);
  });

  it('rejects wrong arity', () => {
    const s = abiFunctionToZod({
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
    });
    expect(() => s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])).toThrow();
    expect(() =>
      s.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100', 'extra']),
    ).toThrow();
  });

  it('handles a function with a tuple input', () => {
    const s = abiFunctionToZod({
      type: 'function',
      name: 'executeOrder',
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
    });
    const out = s.parse([['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '100']]);
    expect(out).toEqual([['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n]]);
  });

  it('handles a function with an array input', () => {
    const s = abiFunctionToZod({
      type: 'function',
      name: 'batch',
      inputs: [{ name: 'amounts', type: 'uint256[]' }],
    });
    const out = s.parse([['1', '2', '3']]);
    expect(out).toEqual([[1n, 2n, 3n]]);
  });

  it('rejects non-function entries', () => {
    expect(() =>
      abiFunctionToZod({
        // @ts-expect-error — deliberately passing wrong type
        type: 'event',
        name: 'Transfer',
        inputs: [],
      }),
    ).toThrow(/function entry/);
    expect(() =>
      abiFunctionToZod({
        // @ts-expect-error — deliberately passing wrong type
        type: 'constructor',
        inputs: [],
      }),
    ).toThrow(/function entry/);
  });
});
