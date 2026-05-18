#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { renderSchemas } from './render-schemas.js';
import { type Abi } from './build-schemas.js';

const [, , input, output] = process.argv;
if (!input) {
  process.stderr.write('Usage: abi-to-zod <input-abi.json> [output.ts]\n');
  process.exit(1);
}

const abi = JSON.parse(readFileSync(input, 'utf8')) as Abi;
const src = renderSchemas(abi, basename(input));
if (output) writeFileSync(output, src);
else process.stdout.write(src);
