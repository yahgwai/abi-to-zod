import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { generate } from './codegen.js';
import { abiToZod, filterFunctions, canonicalSignature, type Abi } from './abi.js';

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

function evalGenerated(source: string): {
  schemas: Record<string, z.ZodType>;
} {
  // Strip TS-only assertions and the `import { z } from 'zod'` line; we
  // supply z and the consts are declared inline by the source body.
  const js = source
    .replace(/^import \{ z \} from 'zod';\n/m, '')
    .replace(/ as `0x\$\{string\}`/g, '');
  // Replace `export const` with `const` so we can collect via locals.
  const noExports = js.replace(/^export const /gm, 'const ');
  // The `as const` cast on the barrel is TS-only.
  const noAsConst = noExports.replace(/\}\s*as\s+const;/g, '};');
  const fn = new Function('z', `${noAsConst}\nreturn schemas;`);
  const schemas = fn(z) as Record<string, z.ZodType>;
  return { schemas };
}

type TupleComponent = { name?: string; type: string; components?: readonly TupleComponent[] };

function placeholderForType(type: string, components?: readonly TupleComponent[]): unknown {
  if (type === 'address') return '0x0000000000000000000000000000000000000000';
  if (type === 'bool') return false;
  if (type === 'string') return 'x';
  if (type === 'bytes') return '0x';
  const bm = /^bytes(\d+)$/.exec(type);
  if (bm) return '0x' + 'a'.repeat(2 * Number(bm[1]));
  if (type === 'uint' || /^uint\d+$/.test(type)) return '1';
  if (type === 'int' || /^int\d+$/.test(type)) return '-1';
  const arr = /^(.+)\[(\d*)\]$/.exec(type);
  if (arr) {
    const inner = arr[1]!;
    const n = arr[2] ? Number(arr[2]) : 0;
    return Array.from({ length: n }, () => placeholderForType(inner, components));
  }
  if (type === 'tuple') {
    const comps = components ?? [];
    const named = comps.length > 0 && comps.every(
      (c) => typeof c.name === 'string' && c.name !== '',
    );
    if (named) {
      const obj: Record<string, unknown> = {};
      for (const c of comps) obj[c.name as string] = placeholderForType(c.type, c.components);
      return obj;
    }
    return comps.map((c) => placeholderForType(c.type, c.components));
  }
  throw new Error(`no placeholder for ${type}`);
}

function placeholderForInputs(inputs: readonly TupleComponent[]): unknown[] {
  return inputs.map((p) => placeholderForType(p.type, p.components));
}

describe('generate: equivalence with abiToZod', () => {
  for (const [rel, abi] of Object.entries(FIXTURES)) {
    it(`fixture ${rel}: generated schemas match runtime parse output`, () => {
      const source = generate(abi, rel.split('/').pop() ?? rel);
      const { schemas } = evalGenerated(source);
      const fns = filterFunctions(abi);
      for (const f of fns) {
        const sig = canonicalSignature(f);
        const generated = schemas[sig];
        expect(generated, `barrel missing signature key ${sig}`).toBeDefined();
        if (!generated) continue;

        let input: unknown[];
        try {
          input = placeholderForInputs(f.inputs);
        } catch {
          // skip functions whose inputs use unsupported types (none expected)
          continue;
        }

        const runtime = (abiToZod(abi) as Record<string, z.ZodType<unknown> | undefined>)[sig];
        expect(runtime, `runtime barrel missing signature key ${sig}`).toBeDefined();
        if (!runtime) continue;
        const a = runtime.safeParse(input);
        const b = generated.safeParse(input);
        expect(b.success, `parse mismatch for ${rel}:${sig}`).toBe(a.success);
        if (a.success && b.success) {
          expect(b.data).toEqual(a.data);
        }
      }
    });
  }
});

describe('generate: header and structure', () => {
  it('emits header with version and source name', () => {
    const abi = [
      {
        type: 'function',
        name: 'foo',
        inputs: [{ type: 'uint256', name: 'x' }],
      },
    ];
    const src = generate(abi as unknown as Abi, 'Foo.json');
    expect(src).toMatch(/^\/\/ Generated by abi-to-zod v.+ from Foo\.json/);
    expect(src).toContain('// Do not edit manually');
    expect(src).toContain(`import { z } from 'zod';`);
  });

  it('falls back to (unnamed) when no source name given', () => {
    const src = generate([], undefined);
    expect(src).toContain('from (unnamed)');
  });

  it('emits per-function export for unambiguous names', () => {
    const abi = [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'value' },
        ],
      },
    ];
    const src = generate(abi as unknown as Abi, 'x');
    expect(src).toContain('export const transferSchema = z.tuple([');
    expect(src).toContain('transfer: transferSchema');
    expect(src).toContain(`'transfer(address,uint256)': transferSchema`);
  });

  it('omits per-function export for overloaded names; inlines in barrel by signature only', () => {
    const abi = [
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { type: 'address', name: 'from' },
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'tokenId' },
        ],
      },
      {
        type: 'function',
        name: 'safeTransferFrom',
        inputs: [
          { type: 'address', name: 'from' },
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'tokenId' },
          { type: 'bytes', name: 'data' },
        ],
      },
    ];
    const src = generate(abi as unknown as Abi, 'x');
    expect(src).not.toContain('export const safeTransferFromSchema');
    expect(src).not.toMatch(/^ {2}safeTransferFrom:/m);
    expect(src).toContain(`'safeTransferFrom(address,address,uint256)':`);
    expect(src).toContain(`'safeTransferFrom(address,address,uint256,bytes)':`);
  });

  it('only emits primitive consts that are actually used', () => {
    const abi = [
      {
        type: 'function',
        name: 'pingAddress',
        inputs: [{ type: 'address', name: 'a' }],
      },
    ];
    const src = generate(abi as unknown as Abi, 'x');
    expect(src).toContain('const ADDRESS =');
    expect(src).not.toContain('const UINT256 =');
    expect(src).not.toContain('const BOOL =');
  });

  it('skips non-function entries', () => {
    const abi = [
      { type: 'event', name: 'Transfer', inputs: [{ type: 'address', name: 'a' }] } as never,
      {
        type: 'function',
        name: 'name',
        inputs: [],
      },
    ];
    const src = generate(abi as unknown as Abi, 'x');
    expect(src).toContain('export const nameSchema');
    expect(src).not.toContain('TransferSchema');
  });

  it('is deterministic: same ABI -> identical bytes', () => {
    const abi = [
      {
        type: 'function',
        name: 'foo',
        inputs: [{ type: 'uint256', name: 'a' }],
      },
      {
        type: 'function',
        name: 'bar',
        inputs: [{ type: 'address', name: 'b' }],
      },
    ];
    expect(generate(abi as unknown as Abi, 'x')).toBe(generate(abi as unknown as Abi, 'x'));
  });
});

describe('generate: snapshot small fixtures', () => {
  const small: ReadonlyArray<readonly [string, Abi]> = [
    ['erc/ERC20.ts', erc20Abi],
    ['arbitrum/precompiles/ArbInfo.ts', arbInfoAbi],
  ];
  for (const [rel, abi] of small) {
    it(`snapshot: ${rel}`, () => {
      const src = generate(abi, rel.split('/').pop() ?? rel);
      expect(src).toMatchSnapshot();
    });
  }
});
