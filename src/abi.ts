import { parseType } from './type-parser.js';
import { type AbiParameter } from './build.js';
import { abiFunctionToZod, type AbiFunctionEntry } from './function.js';

function normalizeBase(base: string): string {
  if (base === 'uint') return 'uint256';
  if (base === 'int') return 'int256';
  return base;
}

function canonicalType(param: AbiParameter): string {
  const { base, suffixes } = parseType(param.type);
  let s: string;
  if (base === 'tuple') {
    s = `(${(param.components ?? []).map(canonicalType).join(',')})`;
  } else {
    s = normalizeBase(base);
  }
  for (const suffix of suffixes) {
    s += suffix === null ? '[]' : `[${suffix}]`;
  }
  return s;
}

export function canonicalSignature(entry: AbiFunctionEntry): string {
  return `${entry.name}(${entry.inputs.map(canonicalType).join(',')})`;
}

function normalizeQuerySignature(sig: string): string {
  return sig.replace(/\b(u?int)(?![a-zA-Z0-9_])/g, '$1256');
}

export type AbiEntry = {
  readonly type?: string;
  readonly name?: string;
  readonly inputs?: readonly AbiParameter[];
  readonly outputs?: readonly AbiParameter[];
};
export type Abi = readonly AbiEntry[];

function filterFunctions(abi: Abi): AbiFunctionEntry[] {
  const out: AbiFunctionEntry[] = [];
  for (const e of abi) {
    if (e.type === 'function' && typeof e.name === 'string' && Array.isArray(e.inputs)) {
      out.push(e as AbiFunctionEntry);
    }
  }
  return out;
}

export function abiToZodSchema(abi: Abi, nameOrSignature: string) {
  const functions = filterFunctions(abi);

  if (nameOrSignature.includes('(')) {
    const target = normalizeQuerySignature(nameOrSignature);
    const match = functions.find((f) => canonicalSignature(f) === target);
    if (!match) {
      throw new Error(`No function found with signature: ${nameOrSignature}`);
    }
    return abiFunctionToZod(match);
  }

  const byName = functions.filter((f) => f.name === nameOrSignature);
  if (byName.length === 0) {
    throw new Error(`No function named: ${nameOrSignature}`);
  }
  if (byName.length > 1) {
    const sigs = byName.map(canonicalSignature).join(', ');
    throw new Error(
      `Ambiguous function name "${nameOrSignature}". Found: ${sigs}. Disambiguate with the full signature.`,
    );
  }
  return abiFunctionToZod(byName[0]!);
}
