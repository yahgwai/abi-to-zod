# Implementation notes

Running log of tradeoffs and deviations from the plan.

## Phase 1 — fixtures

### Arbitrum precompile source

Plan: install `@arbitrum/nitro-precompile-interfaces` from npm + `forge build`
to compile the Solidity interfaces to ABI JSONs.

Actual: `@arbitrum/nitro-precompile-interfaces` is not published on public npm
(404 on install). Pivoted to `@arbitrum/nitro-contracts` alone — it ships the
precompile artifacts under `build/contracts/src/precompiles/*.sol/*.json`
alongside the L1 contracts. No forge build was needed; forge stays unused.

### Hand-written ERC ABIs reverted

I initially hand-wrote the ERC20/721/1155 fixture JSONs from the EIP specs.
User rejected that on the principle that fabricated ABIs risk subtle bugs
(wrong types, missed fields, copy mistakes). ERC fixtures were re-fetched by
compiling `IERC20.sol`, `IERC721.sol`, `IERC1155.sol` from
`@openzeppelin/contracts` via `solc` in a throwaway `/tmp` dir, not as a
committed dependency.

### Mainnet sources

UniswapV2Router: `@uniswap/v2-periphery` npm.
UniswapV3SwapRouter: `@uniswap/v3-periphery` npm.
Seaport 1.6: `@opensea/seaport-js` npm (`src/artifacts/seaport/contracts/
Seaport.sol/Seaport.json`). Etherscan v1 is deprecated and v2 needs a key, so
the npm route was used. If canonical-source preference differs, swap here.

### Sync script

`scripts/sync-fixtures.mjs` regenerates the Arbitrum fixtures by reading the
locally-installed `@arbitrum/nitro-contracts` artifacts. ERC and mainnet
fixtures were one-shot fetches — no committed script for those, since they
involved temp installs and would need separate scripts per source. If we
ever need to refresh, the NOTES above record where each came from.

## Phase 3 — primitive mapping

### Integers: strict-string-only input

Decisions locked in earlier: regex-validated decimal strings, transform to
`bigint`, range-check by width. Implementation: `/^\d+$/` for `uintN`,
`/^-?\d+$/` for `intN`. Hex input not accepted — widening to accept
`0x`-prefixed hex later is a non-breaking change (anything that validated
before still validates).

### Addresses: structural only

`/^0x[0-9a-fA-F]{40}$/` — case-insensitive, no EIP-55 checksum validation.
Adding EIP-55 later would require a `keccak256` dependency. Intentional
deferral; marked as a future option.

### Fixed arrays use `.length(N)`

`T[N]` → `z.array(schema).length(N)`. Runtime-checked; TS-level type is
still `T[]` (loses length info at compile time). Upgrading to
`z.tuple([T, T, ..., T])` would give exact TS length, at the cost of ugly
output for wide fixed arrays (e.g. `uint256[256]`). Not worth it for v1.

## Phase 4 — recursive builder

### `z.tuple` typing requires a non-empty cast

`z.tuple` is typed as `[ZodType, ...ZodType[]]`, requiring at least one
schema. For empty-component tuples (rare but legal) we cast
`componentSchemas as [z.ZodType, ...z.ZodType[]]`. The zod runtime does
accept empty tuples — the cast is just to satisfy the generic signature.

## Phase 6 — viem-style lookup

### Alias normalization

Both the stored canonical signature (derived from the ABI) and the query
signature get `uint` → `uint256` and `int` → `int256` normalization, so a
query like `foo(uint)` matches an ABI entry whose type is `uint256`. This
matches Solidity's selector-computation behavior.

### Overload strategy

If a plain name resolves to multiple function entries, we throw an
"Ambiguous" error listing the candidate signatures and ask the caller to
provide a full signature. Matches viem's behavior.

### Non-function entries ignored

Events, errors, constructor, fallback, and receive entries are silently
filtered out of the lookup space. This means `abiToZod(abi, "Transfer")`
throws "No function named Transfer" even though an event named `Transfer`
exists. Reasonable: this library is input-schema-only, so non-function
entries aren't in scope.

## Phase 7 — integration tests

### Shape of the integration suite

Four tests per fixture:
1. `builds a schema for every function` — every function entry feeds
   `abiFunctionToZod` without throwing.
2. `parses placeholder args for every function` — placeholder args are
   generated from the input types and `schema.parse` is invoked, asserting
   success. Covers runtime validation of every type encountered.
3. `resolves every function via abiToZod(sig)` — confirms the
   canonical-signature lookup path works end-to-end.
4. `rejects wrong-arity inputs` — calls `schema.parse` with one fewer arg
   and expects failure. Verifies the schema actually validates, rather
   than letting anything through.

24 fixtures × 4 tests = 96 integration tests. All passed on first run; no
fixes to the core library were needed as a result of this phase.

### Placeholder generation strategy

- `uintN`/`intN`: `"0"`
- `address`: `0x000...000` (40 hex chars)
- `bytesN`: `0x00...00` (2N hex chars)
- `bytes`: `0x`
- `bool`: `false`
- `string`: `""`
- Dynamic arrays: one element (so the inner shape is actually exercised,
  not trivially skipped by emptiness).
- Fixed arrays `T[N]`: N elements.
- Tuples: recursively-built component placeholders.

The "at least one element in dynamic arrays" choice means inner fixed-size
array constraints are actually checked, not satisfied vacuously.

### Not included in integration tests

- Deeply-nested negative tests (mutating individual fields to exercise
  every primitive's rejection path). The primitive-level unit tests
  already cover this.
- Round-trip tests against real encoders (e.g., feeding the parsed output
  into viem's `encodeFunctionData`). Would add value but also adds a viem
  dependency just for testing. Deferred.

## Explicit v1 non-goals (unchanged from plan)

- EIP-55 address checksum
- Output / return value schemas
- Event / error / constructor entries
- Named-tuple (`z.object`) option for tuples with all components named
- TS-level inference from `as const` ABIs
- Custom error-message mapping
- Hex input for integers (decimal strings only)
- Coercion from number to bigint

Each of these is a widening change — they can be added later without
breaking existing users.

## Dependencies added

Runtime: `zod`.
Dev: `typescript`, `vitest`, `@types/node`, `@arbitrum/nitro-contracts`.
`forge` was globally available but ultimately unused.

## Test coverage

```
src/type-parser.test.ts        12 tests
src/primitives.test.ts         36 tests
src/primitives-source.test.ts  15 tests
src/primitives-spec.test.ts     8 tests
src/build.test.ts              20 tests
src/build-source.test.ts       16 tests
src/function.test.ts            6 tests
src/abi.test.ts                17 tests
src/integration.test.ts        96 tests
src/codegen.test.ts            33 tests
src/cli.test.ts                 3 tests
src/golden.test.ts             25 tests
-----------------------------------------
Total                         287 tests (all passing)
```

## Phase 8 — codegen

Plan: see `docs/codegen-plan.md`. Notes here cover decisions / deviations.

### Shared primitive dispatch

`primitives.ts` now exposes three flavours via one `dispatchPrimitive<T>`
table: `primitiveSchema` (zod), `primitiveSource` (TS source string), and
`primitiveConstName` (the hoisted const identifier, e.g. `UINT256`).
`dispatchPrimitive<z.ZodType>(...)` requires the explicit generic arg — TS
otherwise infers `T` from the first handler and the others fail to unify.

### Renderer / collector lives in build.ts

`renderSchemaSource`, `renderTupleSource`, and `collectPrimitives` sit next
to `buildSchema` because they share the same parse + walk shape. Renderers
take a `PrimitiveResolver` so codegen can route leaves to the hoisted
consts. The collector is a separate pass over the param tree (the plan
flagged this as simpler than threading a set through the renderer).

### canonicalType moved to build.ts

Previously local to `abi.ts`; now exported from `build.ts` since both the
runtime path and the renderer need it. `abi.ts` re-exports for backward
compatibility of the public API.

### Barrel key ordering

Plan: "name keys (unambiguous only), then signature keys." Each group is
sorted lexicographically. Signature keys are always present (overloaded
functions appear only in this group). Name keys reference the hoisted
`<name>Schema`; overload-only signature keys inline the tuple expression.

### Quote style for barrel signature keys

`JSON.stringify(key)` would emit double-quoted keys; switched to literal
single quotes to match the rest of the file (`import { z } from 'zod';`)
and the plan's example. Signatures are guaranteed not to contain `'`.

### Generator version

`generate(abi, sourceName?)` reads `version` from the closest `package.json`
relative to the compiled module location (works for both `src/` during
tests and `dist/` after build).

### Source eval in tests

Generated source contains the TS-only `as `0x${string}`` cast on the hex
transforms. The equivalence tests strip that cast with a regex and pass the
remainder through `new Function('z', ...)`. Easier than wiring up `tsx`
just for tests; only the runtime behaviour needs verifying, not the typing.

### CLI types

`tsconfig.json` had no explicit `types` field; vitest had been pulling in
node typings transitively from test files. Once `**/*.test.ts` is excluded
for the build, the side-effect goes away and `tsc -p tsconfig.build.json`
loses `node:*` and `process`. Added `"types": ["node"]` to fix the build.

### Golden fixtures

24 generator outputs committed to `test/fixtures-generated/` mirroring the
fixture tree. `scripts/regenerate-golden.mjs` rewrites them; `npm run
regenerate:golden` builds first then runs the script. `golden.test.ts`
regenerates in memory and asserts byte-equal to catch accidental drift.

## Phase 9 — spec-driven primitives

`SCHEMA_HANDLERS` and `SOURCE_HANDLERS` were two parallel tables, one per
primitive variant. Tweaking validation rules meant editing both and
relying on tests to catch the asymmetry. Replaced with a single
`SPEC_HANDLERS` table that produces an `Op` list per variant; two
interpreters (`specToZod`, `specToSource`) consume the same spec.

### Structural drift prevention

Both interpreters end with `const _exhaustive: never = op`. Adding a new
`Op` variant without handling it in both fails to compile (`{ op: 'X' }
is not assignable to type 'never'`). The drift between runtime and
codegen is now bounded by the `Op` union's vocabulary: as long as new
validation patterns are expressed as new ops, both paths stay in sync by
construction.

### What the spec covers vs doesn't

Covered: every primitive currently shipped (string, boolean, regex,
transformBigInt, transformHex, refineBigIntBound). Future features
named in `FUTURE.md` that fit the existing ops (hex-input for ints =
regex change) need no new vocabulary. Features that don't fit (EIP-55
conditional checksum, coercion modes) require extending the `Op` union
— a deliberate vocabulary decision rather than a silent fork between the
two paths.

### BoundExpr keeps value + source

`refineBigIntBound` carries `{ value: bigint, source: string }` for each
bound — value drives the runtime predicate, source drives codegen
output. Two adjacent fields in one place vs the previous "two handler
bodies in two files." A dedicated test cross-checks each width: evaluate
`source` as JS, compare to `value`. So even the localized drift surface
(value vs source) is pinned.

### What the spec doesn't cover

The walker (tuple / array / suffix logic) in `buildSchema` vs
`renderSchemaSource` is still parallel. Considered abstracting into a
generic `walkParam<T>(ops)` but the indent state needed for codegen's
pretty-printed tuples doesn't fit a stateless walker cleanly, and the
recursion structure is small (6-line shape, fixed by Solidity's
grammar). Drift risk there is low and the existing tuple/array tests in
`build-source.test.ts` exercise it directly. Documented here as a
deliberate non-goal.

### Error messages

Spec ops carry optional `message` strings. `specToZod` attaches them to
the zod schema; `specToSource` omits them — matching the plan's
"customise once" output format where the user adds their own messages
on the generated file. No drift: the message lives once in the spec,
each interpreter decides whether to consume it.

### Spec is typed as [RootOp, ...ChainOp[]]

First pass had `Spec = readonly Op[]` with `if (!s) throw` guards in
every chain op to satisfy `z.ZodType | undefined`. Tightened to a
tuple type: the first element is a root op (`string` / `boolean`) that
produces the initial schema; the rest are chain ops that take a prior
schema as input. The interpreters split into `applyRoot` + `applyChainZod`
(and the source equivalents), each with its own exhaustiveness check,
so adding a new RootOp or ChainOp variant must update both paths or
fail to compile. Drops the undefined-schema guards and the empty-spec
runtime check.
