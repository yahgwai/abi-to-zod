#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { generate } from './codegen.js';
import { type Abi } from './abi.js';

const [, , input, output] = process.argv;
if (!input) {
  process.stderr.write('Usage: abi-to-zod <input-abi.json> [output.ts]\n');
  process.exit(1);
}

const abi = JSON.parse(readFileSync(input, 'utf8')) as Abi;
const src = generate(abi, basename(input));
if (output) writeFileSync(output, src);
else process.stdout.write(src);
