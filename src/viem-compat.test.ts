import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeFunctionData } from 'viem';
import type { Abi } from 'abitype';
import { abiToZod, canonicalSignature, filterFunctions } from './abi.js';
import { type AbiParameter } from './build.js';
import { parseType } from './type-parser.js';

// The TS-level checks below depend on `as const satisfies Abi` keeping the
// literal types intact through abiToZod. If our types drift, the
// encodeFunctionData call rejects the `args` assignment — that compile
// failure *is* the assertion. Don't paper over it with `as any` or helper
// casts; debug the type signatures instead.
const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const satisfies Abi;

const arbInfoAbi = [
  {
    type: 'function',
    name: 'getBalance',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCode',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
  },
] as const satisfies Abi;

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

const fixturesDir = new URL('../test/fixtures/', import.meta.url);

function loadAbi(relPath: string): Abi {
  return JSON.parse(readFileSync(new URL(relPath, fixturesDir), 'utf8')) as Abi;
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

const FIXTURES = [
  'erc/ERC20.json',
  'erc/ERC721.json',
  'erc/ERC1155.json',
  'arbitrum/precompiles/ArbSys.json',
  'arbitrum/precompiles/ArbGasInfo.json',
  'arbitrum/precompiles/ArbOwner.json',
  'arbitrum/precompiles/ArbOwnerPublic.json',
  'arbitrum/precompiles/ArbRetryableTx.json',
  'arbitrum/precompiles/ArbAddressTable.json',
  'arbitrum/precompiles/ArbAggregator.json',
  'arbitrum/precompiles/ArbWasm.json',
  'arbitrum/precompiles/ArbStatistics.json',
  'arbitrum/precompiles/ArbInfo.json',
  'arbitrum/l1/Inbox.json',
  'arbitrum/l1/Outbox.json',
  'arbitrum/l1/Bridge.json',
  'arbitrum/l1/NodeInterface.json',
  'arbitrum/l1/SequencerInbox.json',
  'arbitrum/l1/RollupAdminLogic.json',
  'arbitrum/l1/RollupUserLogic.json',
  'arbitrum/l1/EdgeChallengeManager.json',
  'mainnet/UniswapV2Router.json',
  'mainnet/UniswapV3SwapRouter.json',
  'mainnet/Seaport.json',
];

describe('viem-compat: runtime loop over every fixture', () => {
  for (const rel of FIXTURES) {
    it(`${rel}: every function survives encodeFunctionData`, () => {
      const abi = loadAbi(rel);
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
