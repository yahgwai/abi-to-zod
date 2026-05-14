#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from '../dist/codegen.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'test', 'fixtures');
const outDir = join(root, 'test', 'fixtures-generated');

if (!existsSync(fixturesDir)) {
  throw new Error(`fixtures dir missing: ${fixturesDir}`);
}

function* walkJson(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJson(full);
    else if (entry.isFile() && entry.name.endsWith('.json')) yield full;
  }
}

let count = 0;
for (const jsonPath of walkJson(fixturesDir)) {
  const rel = relative(fixturesDir, jsonPath);
  const tsRel = rel.replace(/\.json$/, '.ts');
  const outPath = join(outDir, tsRel);
  const abi = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const src = generate(abi, basename(jsonPath));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, src);
  count++;
  console.log(`wrote ${relative(root, outPath)}`);
}
console.log(`regenerated ${count} fixture(s)`);
