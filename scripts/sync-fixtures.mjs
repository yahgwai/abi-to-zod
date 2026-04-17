#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nmBase = join(root, 'node_modules/@arbitrum/nitro-contracts/build/contracts/src');
const outBase = join(root, 'test/fixtures');

function extractAbi(artifactPath, outPath) {
  if (!existsSync(artifactPath)) {
    throw new Error(`Missing artifact: ${artifactPath}`);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + '\n');
  console.log(`wrote ${outPath} (${artifact.abi.length} entries)`);
}

const precompiles = [
  'ArbSys', 'ArbGasInfo', 'ArbOwner', 'ArbOwnerPublic',
  'ArbRetryableTx', 'ArbAddressTable', 'ArbAggregator',
  'ArbWasm', 'ArbStatistics', 'ArbInfo',
];
for (const name of precompiles) {
  extractAbi(
    join(nmBase, `precompiles/${name}.sol/${name}.json`),
    join(outBase, `arbitrum/precompiles/${name}.json`),
  );
}

const l1 = [
  ['bridge/Inbox.sol', 'Inbox'],
  ['bridge/Outbox.sol', 'Outbox'],
  ['bridge/Bridge.sol', 'Bridge'],
  ['bridge/SequencerInbox.sol', 'SequencerInbox'],
  ['rollup/RollupAdminLogic.sol', 'RollupAdminLogic'],
  ['rollup/RollupUserLogic.sol', 'RollupUserLogic'],
  ['challengeV2/EdgeChallengeManager.sol', 'EdgeChallengeManager'],
  ['node-interface/NodeInterface.sol', 'NodeInterface'],
];
for (const [subpath, name] of l1) {
  extractAbi(
    join(nmBase, `${subpath}/${name}.json`),
    join(outBase, `arbitrum/l1/${name}.json`),
  );
}
