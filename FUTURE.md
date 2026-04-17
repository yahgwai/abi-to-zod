# Planned future work

Non-breaking extensions deferred from v1. Each is additive: existing inputs
that validate today will continue to validate after the change.

## Accept hex-string input for integers

Currently `uintN` / `intN` schemas accept decimal-only strings
(`/^-?\d+$/`) and transform to `bigint`. Hex (`0x`-prefixed) strings are
rejected even though they'd be unambiguous.

Proposed regex: `/^-?\d+$/` for `intN` plus `/^0x[0-9a-fA-F]+$/` for both
signed and unsigned (hex is always non-negative). Transform stays
`BigInt(...)`, which already handles both forms. Range check stays
unchanged.

Why defer: not needed for the common UI/config flow where users already
have decimals. Hex is most common in JSON-RPC response bodies, which isn't
the input path we primarily target.

## EIP-55 address checksum validation

Current `address` schema: `/^0x[0-9a-fA-F]{40}$/`. Case-insensitive,
structural only.

To add EIP-55 properly:
- Keep lowercase-only addresses valid (pre-EIP-55 convention).
- If an address contains any uppercase, require the full checksum to be
  valid per EIP-55.
- Requires a `keccak256` implementation. Options: add a small crypto dep
  (e.g. `@noble/hashes`) or hand-roll. No dep today.

Why defer: structural check catches the common typo cases. EIP-55 catches
transcription errors but adds a runtime crypto dependency. Revisit when
the dependency cost is acceptable.

## Other deferred features (already flagged in NOTES.md)

- **Output / return value schemas.** We only produce input schemas today.
- **Event, error, constructor, fallback, receive entries.** Function
  entries only.
- **Named-tuple option (`z.object` instead of `z.tuple`).** For tuples
  where every component has a name, emit an object-keyed schema under an
  opt-in flag.
- **TS-level inference from `as const` ABIs.** Consumers can use
  `z.infer<typeof schema>` today, but the inferred types are derived from
  the runtime schema, not from the ABI literal. A proper type-level walker
  over `as const` ABIs would give tighter types (e.g. `0x${string}` for
  addresses rather than plain `string` if users wanted it).
- **Custom error-message mapping.** Default zod errors on deeply-nested
  failures are rough. A mapping layer that says "failed at
  inputs[2].components[0]" with the ABI path would improve DX.
- **Fixed-array length in TS types.** Currently `T[N]` infers as `T[]`
  (the `.length(N)` check is runtime-only). Switching to `z.tuple([T, T,
  ..., T])` would give exact TS length at the cost of ugly output for
  wide fixed arrays.
- **Coercion of `number` → `bigint` for small integers.** Rejected today
  to avoid silent precision loss above `2^53`. An opt-in coercion mode
  could widen this safely for explicit small-width types (`uint8`, etc.).
