import { describe, it, expect } from 'vitest';
import { encodeFunctionData } from 'viem';
import type { z } from 'zod';
import type { Abi, AbiParametersToPrimitiveTypes } from 'abitype';
import { abiToZod, canonicalSignature, filterFunctions } from './abi.js';
import { type AbiParameter } from './build.js';
import { parseType } from './type-parser.js';

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

// The TS-level checks below depend on `as const satisfies Abi` keeping the
// literal types intact through abiToZod. If our types drift, the
// encodeFunctionData call rejects the `args` assignment — that compile
// failure *is* the assertion. Don't paper over it with `as any` or helper
// casts; debug the type signatures instead.

// Minimal named-struct fragment. abitype infers `placeOrder`'s arg as
// `{ maker: \`0x${string}\`, amount: bigint }` — an object, not a tuple.
// The encodeFunctionData call below proves our barrel delivers that exact
// shape; if doBuild ever reverts to emitting z.tuple for named-tuple
// components, this call fails to compile.
const structAbi = [
  {
    type: 'function',
    name: 'placeOrder',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'maker', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi;

const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;

describe('viem-compat: TS-level (explicit named calls)', () => {
  it('ERC20.transfer', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: schemas.transfer.parse([ADDRESS, '100']),
    });
  });

  it('ERC20.approve', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: schemas.approve.parse([ADDRESS, '100']),
    });
  });

  it('ERC20.transferFrom', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transferFrom',
      args: schemas.transferFrom.parse([ADDRESS, ADDRESS, '100']),
    });
  });

  it('ERC20.balanceOf', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: schemas.balanceOf.parse([ADDRESS]),
    });
  });

  it('ERC20.allowance', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'allowance',
      args: schemas.allowance.parse([ADDRESS, ADDRESS]),
    });
  });

  it('ERC20.totalSupply (zero args)', () => {
    const schemas = abiToZod(erc20Abi);
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'totalSupply',
      args: schemas.totalSupply.parse([]),
    });
  });

  it('ArbInfo.getBalance', () => {
    const schemas = abiToZod(arbInfoAbi);
    encodeFunctionData({
      abi: arbInfoAbi,
      functionName: 'getBalance',
      args: schemas.getBalance.parse([ADDRESS]),
    });
  });

  it('ArbInfo.getCode', () => {
    const schemas = abiToZod(arbInfoAbi);
    encodeFunctionData({
      abi: arbInfoAbi,
      functionName: 'getCode',
      args: schemas.getCode.parse([ADDRESS]),
    });
  });

  it('named-tuple input round-trips as an object', () => {
    const schemas = abiToZod(structAbi);
    encodeFunctionData({
      abi: structAbi,
      functionName: 'placeOrder',
      args: schemas.placeOrder.parse([{ maker: ADDRESS, amount: '100' }]),
    });
  });
});

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

describe('viem-compat: runtime loop over every fixture', () => {
  for (const [rel, abi] of Object.entries(FIXTURES)) {
    it(`${rel}: every function survives encodeFunctionData`, () => {
      const fns = filterFunctions(abi);
      const barrel = abiToZod(abi);
      for (const f of fns) {
        const sig = canonicalSignature(f);
        const schema = barrel[sig];
        if (!schema) throw new Error(`barrel missing ${sig}`);
        const placeholder = f.inputs.map(placeholderFor);
        const parsed = schema.parse(placeholder);
        // viem disambiguates overloads automatically from `args` shape; pass
        // the bare name in every case. Object.keys widens us out of the
        // typed-barrel sharpness here; the runtime assertion is that viem
        // accepts the parsed args without throwing.
        expect(() =>
          encodeFunctionData({
            abi: abi as Abi,
            functionName: f.name,
            args: parsed as readonly unknown[],
          }),
        ).not.toThrow();
      }
    });
  }
});

// === TS-level: exhaustive mapped-type assertion per fixture ===
//
// For every function in every fixture, assert that the schema the barrel
// returns parses to exactly abitype's `AbiParametersToPrimitiveTypes` of the
// function's inputs — using strict structural equality, not assignability.
// Equal<X, Y> is needed because plain `extends` is bidirectional-assignable
// and would let widened types slip through silently. Each fixture gets one
// const declaration; mismatches surface as `['MISMATCH', funcName]` or
// `['NOT_ZOD', funcName]` tuples in the assertion's RHS and fail to satisfy
// the `{ [K]: true }` constraint on the LHS.
//
// Functions with overloaded names are intentionally not covered here: the
// barrel only exposes them by canonical signature (a string we can't form
// from types alone), so this assertion sticks to uniquely-named functions
// and overloads are covered by the runtime loop above.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

type UniqueFunctions<A extends Abi> = Extract<A[number], { type: 'function' }> extends infer F
  ? F extends { type: 'function'; name: string }
    ? Equal<Extract<A[number], { type: 'function'; name: F['name'] }>, F> extends true
      ? F
      : never
    : never
  : never;

type Check<A extends Abi, S> = {
  [F in UniqueFunctions<A> as F['name']]: F['name'] extends keyof S
    ? S[F['name']] extends z.ZodType<infer R>
      ? Equal<R, AbiParametersToPrimitiveTypes<F['inputs']>> extends true
        ? true
        : ['MISMATCH', F['name']]
      : ['NOT_ZOD', F['name']]
    : ['MISSING', F['name']];
};

// Two lines per fixture per plan: snapshot the barrel into a const so its
// inferred type is locked, then assert Check shrinks to all `true`s. The
// `{ [K]: true }` constraint is what trips when Check produces any of the
// `'MISMATCH'` / `'NOT_ZOD'` / `'MISSING'` markers.
const erc20Schemas = abiToZod(erc20Abi);
const _erc20: { [K in keyof Check<typeof erc20Abi, typeof erc20Schemas>]: true } =
  {} as Check<typeof erc20Abi, typeof erc20Schemas>;

const erc721Schemas = abiToZod(erc721Abi);
const _erc721: { [K in keyof Check<typeof erc721Abi, typeof erc721Schemas>]: true } =
  {} as Check<typeof erc721Abi, typeof erc721Schemas>;

const erc1155Schemas = abiToZod(erc1155Abi);
const _erc1155: { [K in keyof Check<typeof erc1155Abi, typeof erc1155Schemas>]: true } =
  {} as Check<typeof erc1155Abi, typeof erc1155Schemas>;

const arbSysSchemas = abiToZod(arbSysAbi);
const _arbSys: { [K in keyof Check<typeof arbSysAbi, typeof arbSysSchemas>]: true } =
  {} as Check<typeof arbSysAbi, typeof arbSysSchemas>;

const arbGasInfoSchemas = abiToZod(arbGasInfoAbi);
const _arbGasInfo: { [K in keyof Check<typeof arbGasInfoAbi, typeof arbGasInfoSchemas>]: true } =
  {} as Check<typeof arbGasInfoAbi, typeof arbGasInfoSchemas>;

const arbOwnerSchemas = abiToZod(arbOwnerAbi);
const _arbOwner: { [K in keyof Check<typeof arbOwnerAbi, typeof arbOwnerSchemas>]: true } =
  {} as Check<typeof arbOwnerAbi, typeof arbOwnerSchemas>;

const arbOwnerPublicSchemas = abiToZod(arbOwnerPublicAbi);
const _arbOwnerPublic: { [K in keyof Check<typeof arbOwnerPublicAbi, typeof arbOwnerPublicSchemas>]: true } =
  {} as Check<typeof arbOwnerPublicAbi, typeof arbOwnerPublicSchemas>;

const arbRetryableTxSchemas = abiToZod(arbRetryableTxAbi);
const _arbRetryableTx: { [K in keyof Check<typeof arbRetryableTxAbi, typeof arbRetryableTxSchemas>]: true } =
  {} as Check<typeof arbRetryableTxAbi, typeof arbRetryableTxSchemas>;

const arbAddressTableSchemas = abiToZod(arbAddressTableAbi);
const _arbAddressTable: { [K in keyof Check<typeof arbAddressTableAbi, typeof arbAddressTableSchemas>]: true } =
  {} as Check<typeof arbAddressTableAbi, typeof arbAddressTableSchemas>;

const arbAggregatorSchemas = abiToZod(arbAggregatorAbi);
const _arbAggregator: { [K in keyof Check<typeof arbAggregatorAbi, typeof arbAggregatorSchemas>]: true } =
  {} as Check<typeof arbAggregatorAbi, typeof arbAggregatorSchemas>;

const arbWasmSchemas = abiToZod(arbWasmAbi);
const _arbWasm: { [K in keyof Check<typeof arbWasmAbi, typeof arbWasmSchemas>]: true } =
  {} as Check<typeof arbWasmAbi, typeof arbWasmSchemas>;

const arbStatisticsSchemas = abiToZod(arbStatisticsAbi);
const _arbStatistics: { [K in keyof Check<typeof arbStatisticsAbi, typeof arbStatisticsSchemas>]: true } =
  {} as Check<typeof arbStatisticsAbi, typeof arbStatisticsSchemas>;

const arbInfoSchemas = abiToZod(arbInfoAbi);
const _arbInfo: { [K in keyof Check<typeof arbInfoAbi, typeof arbInfoSchemas>]: true } =
  {} as Check<typeof arbInfoAbi, typeof arbInfoSchemas>;

const inboxSchemas = abiToZod(inboxAbi);
const _inbox: { [K in keyof Check<typeof inboxAbi, typeof inboxSchemas>]: true } =
  {} as Check<typeof inboxAbi, typeof inboxSchemas>;

const outboxSchemas = abiToZod(outboxAbi);
const _outbox: { [K in keyof Check<typeof outboxAbi, typeof outboxSchemas>]: true } =
  {} as Check<typeof outboxAbi, typeof outboxSchemas>;

const bridgeSchemas = abiToZod(bridgeAbi);
const _bridge: { [K in keyof Check<typeof bridgeAbi, typeof bridgeSchemas>]: true } =
  {} as Check<typeof bridgeAbi, typeof bridgeSchemas>;

const nodeInterfaceSchemas = abiToZod(nodeInterfaceAbi);
const _nodeInterface: { [K in keyof Check<typeof nodeInterfaceAbi, typeof nodeInterfaceSchemas>]: true } =
  {} as Check<typeof nodeInterfaceAbi, typeof nodeInterfaceSchemas>;

const sequencerInboxSchemas = abiToZod(sequencerInboxAbi);
const _sequencerInbox: { [K in keyof Check<typeof sequencerInboxAbi, typeof sequencerInboxSchemas>]: true } =
  {} as Check<typeof sequencerInboxAbi, typeof sequencerInboxSchemas>;

const rollupAdminLogicSchemas = abiToZod(rollupAdminLogicAbi);
const _rollupAdminLogic: { [K in keyof Check<typeof rollupAdminLogicAbi, typeof rollupAdminLogicSchemas>]: true } =
  {} as Check<typeof rollupAdminLogicAbi, typeof rollupAdminLogicSchemas>;

const rollupUserLogicSchemas = abiToZod(rollupUserLogicAbi);
const _rollupUserLogic: { [K in keyof Check<typeof rollupUserLogicAbi, typeof rollupUserLogicSchemas>]: true } =
  {} as Check<typeof rollupUserLogicAbi, typeof rollupUserLogicSchemas>;

const edgeChallengeManagerSchemas = abiToZod(edgeChallengeManagerAbi);
const _edgeChallengeManager: { [K in keyof Check<typeof edgeChallengeManagerAbi, typeof edgeChallengeManagerSchemas>]: true } =
  {} as Check<typeof edgeChallengeManagerAbi, typeof edgeChallengeManagerSchemas>;

const uniswapV2RouterSchemas = abiToZod(uniswapV2RouterAbi);
const _uniswapV2Router: { [K in keyof Check<typeof uniswapV2RouterAbi, typeof uniswapV2RouterSchemas>]: true } =
  {} as Check<typeof uniswapV2RouterAbi, typeof uniswapV2RouterSchemas>;

const uniswapV3SwapRouterSchemas = abiToZod(uniswapV3SwapRouterAbi);
const _uniswapV3SwapRouter: { [K in keyof Check<typeof uniswapV3SwapRouterAbi, typeof uniswapV3SwapRouterSchemas>]: true } =
  {} as Check<typeof uniswapV3SwapRouterAbi, typeof uniswapV3SwapRouterSchemas>;

const seaportSchemas = abiToZod(seaportAbi);
const _seaport: { [K in keyof Check<typeof seaportAbi, typeof seaportSchemas>]: true } =
  {} as Check<typeof seaportAbi, typeof seaportSchemas>;

// Reference each const to silence "declared but never read" on _xxx.
void [
  _erc20, _erc721, _erc1155, _arbSys, _arbGasInfo, _arbOwner, _arbOwnerPublic,
  _arbRetryableTx, _arbAddressTable, _arbAggregator, _arbWasm, _arbStatistics,
  _arbInfo, _inbox, _outbox, _bridge, _nodeInterface, _sequencerInbox,
  _rollupAdminLogic, _rollupUserLogic, _edgeChallengeManager,
  _uniswapV2Router, _uniswapV3SwapRouter, _seaport,
];
