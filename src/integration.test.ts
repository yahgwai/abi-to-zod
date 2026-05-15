import { describe, it, expect } from 'vitest';
import { abiToZod, canonicalSignature, filterFunctions, type Abi } from './abi.js';
import { abiFunctionToZod } from './function.js';
import { parseType } from './type-parser.js';
import { type AbiParameter } from './build.js';

import { abi as erc20Abi } from '../test/fixtures/erc/ERC20.js';
import { abi as erc721Abi } from '../test/fixtures/erc/ERC721.js';
import { abi as erc1155Abi } from '../test/fixtures/erc/ERC1155.js';
import { abi as arbSysAbi } from '../test/fixtures/arbitrum/precompiles/ArbSys.js';
import { abi as arbGasInfoAbi } from '../test/fixtures/arbitrum/precompiles/ArbGasInfo.js';
import { abi as arbOwnerAbi } from '../test/fixtures/arbitrum/precompiles/ArbOwner.js';
import { abi as arbOwnerPublicAbi } from '../test/fixtures/arbitrum/precompiles/ArbOwnerPublic.js';
import { abi as arbRetryableTxAbi } from '../test/fixtures/arbitrum/precompiles/ArbRetryableTx.js';
import { abi as arbAddressTableAbi } from '../test/fixtures/arbitrum/precompiles/ArbAddressTable.js';
import { abi as arbAggregatorAbi } from '../test/fixtures/arbitrum/precompiles/ArbAggregator.js';
import { abi as arbWasmAbi } from '../test/fixtures/arbitrum/precompiles/ArbWasm.js';
import { abi as arbStatisticsAbi } from '../test/fixtures/arbitrum/precompiles/ArbStatistics.js';
import { abi as arbInfoAbi } from '../test/fixtures/arbitrum/precompiles/ArbInfo.js';
import { abi as inboxAbi } from '../test/fixtures/arbitrum/l1/Inbox.js';
import { abi as outboxAbi } from '../test/fixtures/arbitrum/l1/Outbox.js';
import { abi as bridgeAbi } from '../test/fixtures/arbitrum/l1/Bridge.js';
import { abi as nodeInterfaceAbi } from '../test/fixtures/arbitrum/l1/NodeInterface.js';
import { abi as sequencerInboxAbi } from '../test/fixtures/arbitrum/l1/SequencerInbox.js';
import { abi as rollupAdminLogicAbi } from '../test/fixtures/arbitrum/l1/RollupAdminLogic.js';
import { abi as rollupUserLogicAbi } from '../test/fixtures/arbitrum/l1/RollupUserLogic.js';
import { abi as edgeChallengeManagerAbi } from '../test/fixtures/arbitrum/l1/EdgeChallengeManager.js';
import { abi as uniswapV2RouterAbi } from '../test/fixtures/mainnet/UniswapV2Router.js';
import { abi as uniswapV3SwapRouterAbi } from '../test/fixtures/mainnet/UniswapV3SwapRouter.js';
import { abi as seaportAbi } from '../test/fixtures/mainnet/Seaport.js';

const FIXTURES = {
  'erc/ERC20.ts': erc20Abi,
  'erc/ERC721.ts': erc721Abi,
  'erc/ERC1155.ts': erc1155Abi,
  'arbitrum/precompiles/ArbSys.ts': arbSysAbi,
  'arbitrum/precompiles/ArbGasInfo.ts': arbGasInfoAbi,
  'arbitrum/precompiles/ArbOwner.ts': arbOwnerAbi,
  'arbitrum/precompiles/ArbOwnerPublic.ts': arbOwnerPublicAbi,
  'arbitrum/precompiles/ArbRetryableTx.ts': arbRetryableTxAbi,
  'arbitrum/precompiles/ArbAddressTable.ts': arbAddressTableAbi,
  'arbitrum/precompiles/ArbAggregator.ts': arbAggregatorAbi,
  'arbitrum/precompiles/ArbWasm.ts': arbWasmAbi,
  'arbitrum/precompiles/ArbStatistics.ts': arbStatisticsAbi,
  'arbitrum/precompiles/ArbInfo.ts': arbInfoAbi,
  'arbitrum/l1/Inbox.ts': inboxAbi,
  'arbitrum/l1/Outbox.ts': outboxAbi,
  'arbitrum/l1/Bridge.ts': bridgeAbi,
  'arbitrum/l1/NodeInterface.ts': nodeInterfaceAbi,
  'arbitrum/l1/SequencerInbox.ts': sequencerInboxAbi,
  'arbitrum/l1/RollupAdminLogic.ts': rollupAdminLogicAbi,
  'arbitrum/l1/RollupUserLogic.ts': rollupUserLogicAbi,
  'arbitrum/l1/EdgeChallengeManager.ts': edgeChallengeManagerAbi,
  'mainnet/UniswapV2Router.ts': uniswapV2RouterAbi,
  'mainnet/UniswapV3SwapRouter.ts': uniswapV3SwapRouterAbi,
  'mainnet/Seaport.ts': seaportAbi,
} as const;

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
    const comps = param.components ?? [];
    const named = comps.length > 0 && comps.every(
      (c) => typeof c.name === 'string' && c.name !== '',
    );
    if (named) {
      const obj: Record<string, unknown> = {};
      for (const c of comps) obj[c.name as string] = placeholderFor(c);
      value = obj;
    } else {
      value = comps.map(placeholderFor);
    }
  } else {
    value = placeholderPrimitive(base);
  }
  for (const suffix of suffixes) {
    const count = suffix ?? 1;
    value = Array(count).fill(value);
  }
  return value;
}

function runFixture(relPath: string, abi: Abi) {
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
      const barrel = abiToZod(abi) as Record<string, unknown>;
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

for (const [rel, abi] of Object.entries(FIXTURES)) {
  runFixture(rel, abi);
}
