#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { abiToZod, type AbiParameter } from '../src/index.js';
import { parseType } from '../src/type-parser.js';

const [fixturePath, query] = process.argv.slice(2);
if (!fixturePath || !query) {
  console.error('Usage: npx tsx scripts/show-schema.ts <fixture-path> <function-name-or-signature>');
  process.exit(1);
}

type Entry = { type?: string; name?: string; inputs?: AbiParameter[] };
const abi = JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) as Entry[];
const schema = abiToZod(abi, query);

const fn = findMatch(abi, query);
console.log(`# ${query}\n`);
console.log('## ABI inputs');
console.log(JSON.stringify(fn?.inputs ?? [], null, 2));

const args = (fn?.inputs ?? []).map(placeholderFor);
console.log('\n## Sample input (placeholder)');
console.log(args);

console.log('\n## Parsed output');
try {
  console.log(schema.parse(args));
} catch (err) {
  console.log('parse failed:', err instanceof Error ? err.message : err);
}

function findMatch(entries: Entry[], q: string): Entry | undefined {
  if (q.includes('(')) {
    const target = q.replace(/\b(u?int)(?![a-zA-Z0-9_])/g, '$1256');
    return entries.find((e) => e.type === 'function' && canonical(e) === target);
  }
  return entries.find((e) => e.type === 'function' && e.name === q);
}

function canonical(e: Entry): string {
  return `${e.name}(${(e.inputs ?? []).map(typeStr).join(',')})`;
}

function typeStr(p: AbiParameter): string {
  const { base, suffixes } = parseType(p.type);
  let s: string;
  if (base === 'tuple') {
    s = `(${(p.components ?? []).map(typeStr).join(',')})`;
  } else if (base === 'uint') {
    s = 'uint256';
  } else if (base === 'int') {
    s = 'int256';
  } else {
    s = base;
  }
  for (const suf of suffixes) s += suf === null ? '[]' : `[${suf}]`;
  return s;
}

function placeholderFor(p: AbiParameter): unknown {
  const { base, suffixes } = parseType(p.type);
  let v: unknown;
  if (base === 'tuple') {
    v = (p.components ?? []).map(placeholderFor);
  } else if (base === 'address') {
    v = '0x' + '0'.repeat(40);
  } else if (base === 'bool') {
    v = false;
  } else if (base === 'string') {
    v = '';
  } else if (base === 'bytes') {
    v = '0x';
  } else if (/^bytes(\d+)$/.test(base)) {
    const n = Number(/^bytes(\d+)$/.exec(base)![1]);
    v = '0x' + '0'.repeat(2 * n);
  } else {
    v = '0';
  }
  for (const suf of suffixes) v = Array(suf ?? 1).fill(v);
  return v;
}
