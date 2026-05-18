import { describe, it, expect } from 'vitest';
import { parseType } from '../src/type-parser.js';

describe('parseType', () => {
  it('parses primitives', () => {
    expect(parseType('uint256')).toEqual({ base: 'uint256', suffixes: [] });
    expect(parseType('int256')).toEqual({ base: 'int256', suffixes: [] });
    expect(parseType('address')).toEqual({ base: 'address', suffixes: [] });
    expect(parseType('bool')).toEqual({ base: 'bool', suffixes: [] });
    expect(parseType('string')).toEqual({ base: 'string', suffixes: [] });
    expect(parseType('bytes')).toEqual({ base: 'bytes', suffixes: [] });
    expect(parseType('bytes32')).toEqual({ base: 'bytes32', suffixes: [] });
    expect(parseType('tuple')).toEqual({ base: 'tuple', suffixes: [] });
    expect(parseType('uint')).toEqual({ base: 'uint', suffixes: [] });
    expect(parseType('int')).toEqual({ base: 'int', suffixes: [] });
  });

  it('parses dynamic arrays', () => {
    expect(parseType('uint256[]')).toEqual({ base: 'uint256', suffixes: [null] });
    expect(parseType('address[]')).toEqual({ base: 'address', suffixes: [null] });
    expect(parseType('bytes32[]')).toEqual({ base: 'bytes32', suffixes: [null] });
    expect(parseType('tuple[]')).toEqual({ base: 'tuple', suffixes: [null] });
  });

  it('parses fixed-size arrays', () => {
    expect(parseType('uint256[3]')).toEqual({ base: 'uint256', suffixes: [3] });
    expect(parseType('bytes32[2]')).toEqual({ base: 'bytes32', suffixes: [2] });
    expect(parseType('uint64[2]')).toEqual({ base: 'uint64', suffixes: [2] });
    expect(parseType('tuple[4]')).toEqual({ base: 'tuple', suffixes: [4] });
  });

  it('parses nested arrays in innermost-to-outermost order', () => {
    expect(parseType('uint256[3][]')).toEqual({ base: 'uint256', suffixes: [3, null] });
    expect(parseType('uint256[][3]')).toEqual({ base: 'uint256', suffixes: [null, 3] });
    expect(parseType('uint64[3][]')).toEqual({ base: 'uint64', suffixes: [3, null] });
    expect(parseType('tuple[2][3][]')).toEqual({ base: 'tuple', suffixes: [2, 3, null] });
    expect(parseType('uint256[][][]')).toEqual({ base: 'uint256', suffixes: [null, null, null] });
  });

  it('rejects empty string', () => {
    expect(() => parseType('')).toThrow(/Invalid ABI type/);
  });

  it('rejects leading bracket', () => {
    expect(() => parseType('[]')).toThrow(/Invalid ABI type/);
    expect(() => parseType('[3]')).toThrow(/Invalid ABI type/);
  });

  it('rejects unclosed brackets', () => {
    expect(() => parseType('uint256[')).toThrow(/Invalid ABI type/);
    expect(() => parseType('uint256[3')).toThrow(/Invalid ABI type/);
  });

  it('rejects unopened brackets', () => {
    expect(() => parseType('uint256]')).toThrow(/Invalid ABI type/);
  });

  it('rejects non-numeric array sizes', () => {
    expect(() => parseType('uint256[abc]')).toThrow(/Invalid ABI type/);
    expect(() => parseType('uint256[-1]')).toThrow(/Invalid ABI type/);
  });

  it('rejects zero-size arrays', () => {
    expect(() => parseType('uint256[0]')).toThrow(/size 0/);
  });

  it('rejects trailing content after suffix chain', () => {
    expect(() => parseType('uint256[]extra')).toThrow(/Invalid ABI type/);
  });

  it('rejects whitespace', () => {
    expect(() => parseType(' uint256')).toThrow(/Invalid ABI type/);
    expect(() => parseType('uint256 ')).toThrow(/Invalid ABI type/);
    expect(() => parseType('uint256[ ]')).toThrow(/Invalid ABI type/);
  });
});
