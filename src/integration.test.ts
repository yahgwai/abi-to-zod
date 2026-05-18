import { describe, it, expect } from 'vitest';
import {
  buildFunctionInputsSchema,
  canonicalSignature,
  filterFunctions,
  type Abi,
} from './schemas.js';
import { placeholderFor } from './test-helpers.js';

import { FIXTURES } from '../test/fixtures/index.js';

function runFixture(relPath: string, abi: Abi) {
  const functions = filterFunctions(abi);

  describe(relPath, () => {
    it(`builds a schema for every function (${functions.length} fns)`, () => {
      for (const f of functions) {
        expect(
          () => buildFunctionInputsSchema(f),
          `buildFunctionInputsSchema failed for ${canonicalSignature(f)}`,
        ).not.toThrow();
      }
    });

    it('rejects wrong-arity inputs', () => {
      for (const f of functions) {
        if (f.inputs.length === 0) continue;
        const schema = buildFunctionInputsSchema(f);
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
