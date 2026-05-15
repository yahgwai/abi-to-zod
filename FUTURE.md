# Planned future work

Non-breaking extensions deferred from v1. Each is additive: existing
inputs that validate today will continue to validate after the change.
Ordered by priority — top items unlock real correctness, DX, or
testing wins; bottom items are niche.

## High priority

### Bulk `abiToZod(abi)` — return all schemas

Currently `abiToZod` requires a second argument (name or signature) and
returns a single `ZodTuple`. The obvious bulk variant — `abiToZod(abi)`
returning an object keyed by both name and full signature, mirroring
the codegen barrel — is missing.

```ts
const schemas = abiToZod(abi);
schemas.transfer.parse([...]);
schemas['safeTransferFrom(address,address,uint256,bytes)'].parse([...]);
```

Same internal machinery; just a wrapper that walks every function entry
and assembles the object. Aligns the runtime API with the codegen
output's shape.

### Validate schema output against real encoders (viem round-trip)

The integration tests currently prove schemas build and accept
placeholder inputs — they do NOT prove the parsed output is what viem
or ethers would accept as args. A schema could emit the wrong shape
(e.g., string where bigint is expected) and tests wouldn't notice.

Proposal: per fixture, per function, generate placeholder args, parse
them through our schema, feed the output into
`viem.encodeFunctionData(...)`. If it doesn't throw, the round-trip
works.

Test-only addition. Catches drift between our types and the canonical
encoders. Adds `viem` as a devDep only.

### Type-level inference from `as const` ABIs (via abitype)

Currently `abiToZod(abi, 'transfer')` accepts plain `string` for the
function name — typos are runtime errors, and the returned schema is
loosely typed. `z.infer` works but loses ABI-specific naming/typing.

With `abitype` as a peer-dep, we can derive types from `as const` ABI
literals:

- Function-name autocomplete and compile-time validation against the
  ABI's actual entries.
- Schema return type tightly typed: `ZodTuple<[<address>, <uint256>]>`
  derived from the ABI literal, so `z.infer` yields
  `[\`0x${string}\`, bigint]` without manual annotation.
- Mismatched arg shapes caught at compile time.

abitype's type mappings (bigint for ints, `0x${string}` for addresses)
already match our runtime choices — adoption validates rather than
conflicts with our defaults. Significant type-level work; the runtime
behaviour stays unchanged, only the function signatures gain tighter
generics.

### Improved parse-time error messages

We added `BuildSchemaError` with ABI-path context for *schema-build*
failures (when the ABI itself is malformed). What's still rough is
*parse-time* failures — when a user passes bad input to a built schema.
Default zod errors on deeply nested ABIs look like:

```
Invalid input: expected string, received undefined
  at [2].components[0].components[1]
```

No parameter names, no type context. Hard to action without staring at
the ABI.

Proposal: attach metadata during schema construction (parameter names,
Solidity types per path), then use a custom zod `errorMap` to render
human-readable failures:

```
At inputs[2].order.offer[0].itemType: expected string, received undefined
```

Backward compatible — same throws, friendlier messages.

## Medium priority

### Output / return-value schemas

Currently we build schemas for function INPUTS only. Schemas for
OUTPUTS (decoded return values) are equally valid for validating
contract reads, RPC responses, indexers, etc. Same Solidity type
system, so most of the existing recursion applies.

### Accept hex-string input for integers

`uintN` / `intN` currently accept decimal-only strings (`/^-?\d+$/`)
and transform to `bigint`. Hex strings (`0x...`) are rejected.

Proposed: `/^-?\d+|0x[0-9a-fA-F]+$/`. Transform stays `BigInt(...)`,
which handles both forms. Range check unchanged. Anything that
validated before still validates.

Why deferred: not common for UI/config flows where decimals dominate.
Hex is more typical of JSON-RPC response bodies, which isn't the
primary input target.

### Named-tuple option (`z.object` for tuples)

All tuples currently render as positional `z.tuple([...])`. Adding an
option to emit `z.object({...})` for tuples whose components are all
named would significantly improve struct ergonomics — real field names
in TS, in errors, in IDE autocomplete.

Tricky decisions: partially-named tuples, arrays-of-tuples, and
preserving viem/ethers compatibility for input.

## Lower priority

### EIP-55 address checksum validation

Currently `/^0x[0-9a-fA-F]{40}$/` — case-insensitive, structural only.

Adding EIP-55: lowercase addresses stay valid; mixed-case addresses
require a valid checksum. Requires a `keccak256` implementation —
either a small crypto dep (e.g., `@noble/hashes`) or hand-rolled. No
dep today.

### Event, error, constructor, fallback, receive entries

`function` entries only today. Events would emit schemas for
indexed/non-indexed arg arrays; errors for revert-data decoding;
constructors for deployment args. Same machinery, different ABI fields.

### Fixed-array length in TS types

`T[N]` currently infers as `T[]` (the `.length(N)` check is
runtime-only). Switching to `z.tuple([T, T, ..., T])` would give exact
TS length at the cost of ugly emit for wide fixed arrays
(`uint256[256]` becomes 256 entries).

### Coercion of `number` → `bigint`

Rejected today to avoid silent precision loss above `2^53`. An opt-in
coercion mode could widen this safely for explicit small-width types
(`uint8`, `uint16`, etc.) where precision isn't at risk.
