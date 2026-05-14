#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseType } from '../src/type-parser.js';
import type { AbiParameter } from '../src/index.js';

const [fixturePath, filter] = process.argv.slice(2);
if (!fixturePath) {
  console.error('Usage: npx tsx scripts/show-schema.ts <fixture-path> [function-name-or-signature]');
  process.exit(1);
}

type Entry = { type?: string; name?: string; inputs?: AbiParameter[] };
const abi = JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) as Entry[];

const functions = abi.filter(
  (e): e is Required<Pick<Entry, 'type' | 'name' | 'inputs'>> =>
    e.type === 'function' && typeof e.name === 'string' && Array.isArray(e.inputs),
);

const target = functions.filter((f) => {
  if (!filter) return true;
  if (filter.includes('(')) return canonicalSignature(f) === normalizeSig(filter);
  return f.name === filter;
});

if (target.length === 0) {
  console.error(`No matching function in ${fixturePath} for ${filter ?? '<any>'}.`);
  process.exit(1);
}

for (const f of target) {
  console.log(`=== ${canonicalSignature(f)} ===`);
  console.log(renderParams(f.inputs, ''));
  console.log('');
}

function canonicalSignature(f: { name: string; inputs: readonly AbiParameter[] }): string {
  return `${f.name}(${f.inputs.map(typeStr).join(',')})`;
}

function normalizeSig(s: string): string {
  return s.replace(/\b(u?int)(?![a-zA-Z0-9_])/g, '$1256');
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

function renderParams(ps: readonly AbiParameter[], indent: string): string {
  if (ps.length === 0) return 'z.tuple([])';
  const inner = indent + '  ';
  const lines = ps.map((p) => {
    const tag = p.name ? `/* ${p.name}: ${p.type} */ ` : `/* ${p.type} */ `;
    return inner + tag + renderParam(p, inner);
  });
  return `z.tuple([\n${lines.join(',\n')}\n${indent}])`;
}

function renderParam(p: AbiParameter, indent: string): string {
  const { base, suffixes } = parseType(p.type);
  let s: string;
  if (base === 'tuple') {
    s = renderParams(p.components ?? [], indent);
  } else {
    s = renderPrimitive(base);
  }
  for (const suf of suffixes) {
    s = suf === null ? `z.array(${s})` : `z.array(${s}).length(${suf})`;
  }
  return s;
}

function renderPrimitive(base: string): string {
  if (base === 'uint' || /^uint\d+$/.test(base)) {
    const bits = base === 'uint' ? 256 : Number(base.slice(4));
    return `z.string().regex(/^\\d+$/).transform(BigInt).refine(n => n <= 2n ** ${bits}n - 1n)`;
  }
  if (base === 'int' || /^int\d+$/.test(base)) {
    const bits = base === 'int' ? 256 : Number(base.slice(3));
    return `z.string().regex(/^-?\\d+$/).transform(BigInt).refine(n => n >= -(2n ** ${bits - 1}n) && n <= 2n ** ${bits - 1}n - 1n)`;
  }
  if (base === 'address') return 'z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v as `0x${string}`)';
  if (base === 'bool') return 'z.boolean()';
  if (base === 'string') return 'z.string()';
  if (base === 'bytes') return 'z.string().regex(/^0x([0-9a-fA-F]{2})*$/).transform(v => v as `0x${string}`)';
  const m = /^bytes(\d+)$/.exec(base);
  if (m) {
    const n = Number(m[1]);
    return `z.string().regex(/^0x[0-9a-fA-F]{${2 * n}}$/).transform(v => v as \`0x\${string}\`)`;
  }
  return `/* unsupported: ${base} */`;
}
