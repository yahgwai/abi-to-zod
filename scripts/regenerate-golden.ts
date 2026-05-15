#!/usr/bin/env tsx
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from '../src/codegen.js';

import { FIXTURES } from '../test/fixtures/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'test', 'fixtures-generated');

let count = 0;
for (const [rel, abi] of Object.entries(FIXTURES)) {
  const outPath = join(outDir, rel);
  const sourceName = rel.split('/').pop() ?? rel;
  const src = generate(abi, sourceName);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, src);
  count++;
  console.log(`wrote ${relative(root, outPath)}`);
}
console.log(`regenerated ${count} fixture(s)`);
