#!/usr/bin/env tsx
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from '../src/codegen.js';
import type { Abi } from '../src/abi.js';

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

const FIXTURES: ReadonlyArray<readonly [string, Abi]> = [
  ['erc/ERC20.ts', erc20Abi],
  ['erc/ERC721.ts', erc721Abi],
  ['erc/ERC1155.ts', erc1155Abi],
  ['arbitrum/precompiles/ArbSys.ts', arbSysAbi],
  ['arbitrum/precompiles/ArbGasInfo.ts', arbGasInfoAbi],
  ['arbitrum/precompiles/ArbOwner.ts', arbOwnerAbi],
  ['arbitrum/precompiles/ArbOwnerPublic.ts', arbOwnerPublicAbi],
  ['arbitrum/precompiles/ArbRetryableTx.ts', arbRetryableTxAbi],
  ['arbitrum/precompiles/ArbAddressTable.ts', arbAddressTableAbi],
  ['arbitrum/precompiles/ArbAggregator.ts', arbAggregatorAbi],
  ['arbitrum/precompiles/ArbWasm.ts', arbWasmAbi],
  ['arbitrum/precompiles/ArbStatistics.ts', arbStatisticsAbi],
  ['arbitrum/precompiles/ArbInfo.ts', arbInfoAbi],
  ['arbitrum/l1/Inbox.ts', inboxAbi],
  ['arbitrum/l1/Outbox.ts', outboxAbi],
  ['arbitrum/l1/Bridge.ts', bridgeAbi],
  ['arbitrum/l1/NodeInterface.ts', nodeInterfaceAbi],
  ['arbitrum/l1/SequencerInbox.ts', sequencerInboxAbi],
  ['arbitrum/l1/RollupAdminLogic.ts', rollupAdminLogicAbi],
  ['arbitrum/l1/RollupUserLogic.ts', rollupUserLogicAbi],
  ['arbitrum/l1/EdgeChallengeManager.ts', edgeChallengeManagerAbi],
  ['mainnet/UniswapV2Router.ts', uniswapV2RouterAbi],
  ['mainnet/UniswapV3SwapRouter.ts', uniswapV3SwapRouterAbi],
  ['mainnet/Seaport.ts', seaportAbi],
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'test', 'fixtures-generated');

let count = 0;
for (const [rel, abi] of FIXTURES) {
  const outPath = join(outDir, rel);
  const sourceName = rel.split('/').pop() ?? rel;
  const src = generate(abi, sourceName);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, src);
  count++;
  console.log(`wrote ${relative(root, outPath)}`);
}
console.log(`regenerated ${count} fixture(s)`);
