import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from './codegen.js';
import { type Abi } from './abi.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(repoRoot, 'test', 'fixtures');
const goldenDir = join(repoRoot, 'test', 'fixtures-generated');

function* walkJson(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.isFile() && entry.name.endsWith('.json')) yield full;
  }
}

describe('golden fixtures', () => {
  const paths = [...walkJson(fixturesDir)];

  it('directory exists (run scripts/regenerate-golden.mjs to populate)', () => {
    expect(existsSync(goldenDir)).toBe(true);
  });

  for (const jsonPath of paths) {
    const rel = relative(fixturesDir, jsonPath);
    const tsRel = rel.replace(/\.json$/, '.ts');
    const goldenPath = join(goldenDir, tsRel);
    it(`${rel}: regeneration matches committed golden`, () => {
      const abi = JSON.parse(readFileSync(jsonPath, 'utf8')) as Abi;
      const expected = readFileSync(goldenPath, 'utf8');
      const actual = generate(abi, basename(jsonPath));
      expect(actual).toBe(expected);
    });
  }
});
