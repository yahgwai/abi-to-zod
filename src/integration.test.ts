import { describe, it, expect } from 'vitest';
import { abiToZod, canonicalSignature, filterFunctions, type Abi } from './abi.js';
import { abiFunctionToZod } from './function.js';
import { placeholderFor } from './test-helpers.js';

import { FIXTURES } from '../test/fixtures/index.js';

function runFixture(relPath: string, abi: Abi) {
  const functions = filterFunctions(abi);

  describe(relPath, () => {
    it(`builds a schema for every function (${functions.length} fns)`, () => {
      for (const f of functions) {
        expect(
          () => abiFunctionToZod(f),
          `abiFunctionToZod failed for ${canonicalSignature(f)}`,
        ).not.toThrow();
      }
    });

    it('parses placeholder args for every function', () => {
      for (const f of functions) {
        const schema = abiFunctionToZod(f);
        const args = f.inputs.map(placeholderFor);
        const result = schema.safeParse(args);
        if (!result.success) {
          throw new Error(
            `schema.parse failed for ${canonicalSignature(f)}: ${JSON.stringify(result.error.issues)}`,
          );
        }
      }
    });

    it('resolves every function via barrel signature key', () => {
      const barrel = abiToZod(abi) as Record<string, unknown>;
      for (const f of functions) {
        const sig = canonicalSignature(f);
        expect(barrel[sig], `barrel missing signature key ${sig}`).toBeDefined();
      }
    });

    it('rejects wrong-arity inputs', () => {
      for (const f of functions) {
        if (f.inputs.length === 0) continue;
        const schema = abiFunctionToZod(f);
        const short = f.inputs.slice(1).map(placeholderFor);
        const result = schema.safeParse(short);
        if (result.success) {
          throw new Error(`Expected parse to fail for ${canonicalSignature(f)} with wrong arity`);
        }
      }
    });
  });
}

for (const [rel, abi] of Object.entries(FIXTURES)) {
  runFixture(rel, abi);
}
