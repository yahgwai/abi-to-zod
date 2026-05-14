import { type AbiParameter, canonicalType } from './build.js';
import { abiFunctionToZod, type AbiFunctionEntry } from './function.js';

export { canonicalType };

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

export function filterFunctions(abi: Abi): AbiFunctionEntry[] {
  const out: AbiFunctionEntry[] = [];
  for (let i = 0; i < abi.length; i++) {
    const e = abi[i]!;
    if (e.type !== 'function') continue;
    if (typeof e.name !== 'string') {
      throw new Error(`abi[${i}]: function entry has missing or non-string 'name'`);
    }
    if (!Array.isArray(e.inputs)) {
      throw new Error(
        `abi[${i}] (${e.name}): function entry has missing or non-array 'inputs'`,
      );
    }
    out.push(e as AbiFunctionEntry);
  }
  return out;
}

export function abiToZod(abi: Abi, nameOrSignature: string) {
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
