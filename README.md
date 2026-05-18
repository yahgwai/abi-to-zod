# abi-to-zod

Generate Zod schemas from Ethereum ABIs.

## Install

```sh
npm install abi-to-zod
```

## Usage

### `buildSchemas`

Build runtime Zod schemas for an ABI's function inputs.

```ts
import { buildSchemas } from 'abi-to-zod';

const abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

const schemas = buildSchemas(abi);
schemas.transfer.parse(['0x0000000000000000000000000000000000000000', 1n]);
```

### `renderSchemas`

Render the schemas as a TypeScript source file.

```ts
import { renderSchemas } from 'abi-to-zod';
import { writeFileSync } from 'node:fs';
import { abi } from './my-abi.js';

writeFileSync('schemas.ts', renderSchemas(abi));
```

### CLI

```sh
abi-to-zod ./MyContract.abi.json ./schemas.ts
```

Without an output path, the source is written to stdout.
