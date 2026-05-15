import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { abiToZod, canonicalSignature, filterFunctions, type Abi } from './abi.js';
import { abiFunctionToZod } from './function.js';
import { parseType } from './type-parser.js';
import { type AbiParameter } from './build.js';

const fixturesDir = new URL('../test/fixtures/', import.meta.url);

function loadAbi(relPath: string): Abi {
  return JSON.parse(readFileSync(new URL(relPath, fixturesDir), 'utf8'));
}

function placeholderPrimitive(base: string): unknown {
  if (base === 'uint' || base === 'int' || /^u?int\d+$/.test(base)) return '0';
  if (base === 'address') return '0x' + '0'.repeat(40);
  if (base === 'bool') return false;
  if (base === 'string') return '';
  if (base === 'bytes') return '0x';
  const m = /^bytes(\d+)$/.exec(base);
  if (m) return '0x' + '0'.repeat(2 * Number(m[1]!));
  throw new Error(`No placeholder for base type: ${base}`);
}

function placeholderFor(param: AbiParameter): unknown {
  const { base, suffixes } = parseType(param.type);
  let value: unknown;
  if (base === 'tuple') {
    value = (param.components ?? []).map(placeholderFor);
  } else {
    value = placeholderPrimitive(base);
  }
  for (const suffix of suffixes) {
    const count = suffix ?? 1;
    value = Array(count).fill(value);
  }
  return value;
}

function runFixture(relPath: string) {
  const abi = loadAbi(relPath);
  const functions = filterFunctions(abi);

  describe(relPath, () => {
    it(`builds a schema for every function (${functions.length} fns)`, () => {
      for (const f of functions) {
        expect(
          () => abiFunctionToZod(f),
          `abiFunctionToZod failed for ${canonicalSignature(f)}`,
        ).not.toThrow();
      }
    });

    it('parses placeholder args for every function', () => {
      for (const f of functions) {
        const schema = abiFunctionToZod(f);
        const args = f.inputs.map(placeholderFor);
        const result = schema.safeParse(args);
        if (!result.success) {
          throw new Error(
            `schema.parse failed for ${canonicalSignature(f)}: ${JSON.stringify(result.error.issues)}`,
          );
        }
      }
    });

    it('resolves every function via barrel signature key', () => {
      const barrel = abiToZod(abi);
      for (const f of functions) {
        const sig = canonicalSignature(f);
        expect(barrel[sig], `barrel missing signature key ${sig}`).toBeDefined();
      }
    });

    it('rejects wrong-arity inputs', () => {
      for (const f of functions) {
        if (f.inputs.length === 0) continue;
        const schema = abiFunctionToZod(f);
        const short = f.inputs.slice(1).map(placeholderFor);
        const result = schema.safeParse(short);
        if (result.success) {
          throw new Error(`Expected parse to fail for ${canonicalSignature(f)} with wrong arity`);
        }
      }
    });
  });
}

runFixture('erc/ERC20.json');
runFixture('erc/ERC721.json');
runFixture('erc/ERC1155.json');
runFixture('arbitrum/precompiles/ArbSys.json');
runFixture('arbitrum/precompiles/ArbGasInfo.json');
runFixture('arbitrum/precompiles/ArbOwner.json');
runFixture('arbitrum/precompiles/ArbOwnerPublic.json');
runFixture('arbitrum/precompiles/ArbRetryableTx.json');
runFixture('arbitrum/precompiles/ArbAddressTable.json');
runFixture('arbitrum/precompiles/ArbAggregator.json');
runFixture('arbitrum/precompiles/ArbWasm.json');
runFixture('arbitrum/precompiles/ArbStatistics.json');
runFixture('arbitrum/precompiles/ArbInfo.json');
runFixture('arbitrum/l1/Inbox.json');
runFixture('arbitrum/l1/Outbox.json');
runFixture('arbitrum/l1/Bridge.json');
runFixture('arbitrum/l1/NodeInterface.json');
runFixture('arbitrum/l1/SequencerInbox.json');
runFixture('arbitrum/l1/RollupAdminLogic.json');
runFixture('arbitrum/l1/RollupUserLogic.json');
runFixture('arbitrum/l1/EdgeChallengeManager.json');
runFixture('mainnet/UniswapV2Router.json');
runFixture('mainnet/UniswapV3SwapRouter.json');
runFixture('mainnet/Seaport.json');
