# Widen integer input + constructor schemas plan

Self-contained plan for three additive changes to `abi-to-zod`. Pick up
from a fresh context window.

## Goal

Three non-breaking widenings:

1. **Hex-string input for integers.** `uint*` and `int*` schemas accept
   `0x`-prefixed hex strings in addition to decimal strings.
2. **BigInt input for integers.** Same schemas also accept native
   `bigint` values directly.
3. **Constructor schemas.** ABI entries with `type: 'constructor'` get a
   schema, surfaced via the typed barrel under the `constructor` key and
   (in codegen) as `export const constructorSchema`.

Each is additive — anything that validated before still validates after.
Output types don't change; only the input surface widens, and the
barrel gains an optional `constructor` key.

## Scope (out)

Explicitly **not** in this PR:

- **Output (return-value) schemas.** Still input-only for functions.
- **Event / error schemas.** Filtered out as before.
- **Fallback / receive entries.** No meaningful args.
- **Function-pointer parameter types.** Still rejected at construction.
- **Fixed-point types.** Still rejected.
- **EIP-55 address checksum.**
- **Numeric (`number`) input for integers.** `bigint` is the only new
  non-string variant — `number` loses precision above 2^53 and we'd
  rather keep the input surface explicit.

## Why now

Earlier scope decisions (the original codegen plan, the barrel refactor)
deliberately kept the input surface narrow: decimal strings only,
function entries only. Two observations push us to widen now:

- **Hex input.** JSON-RPC return data is hex. A user piping raw call
  results through our schemas has to manually convert to decimal first.
  Trivial regex change, eliminates a common workaround.
- **BigInt input.** `bigint` is the natural blockchain integer
  representation. Forcing string-only forces an awkward
  `value.toString()` step at every call site. abitype types our parse
  output as `bigint` (or `number` for ≤48-bit widths); the input
  asymmetry is jarring.
- **Constructors.** Solidity constructors are functionally just
  unnamed function entries with args. Validating constructor args at
  deployment time is the same use case as validating function call
  args. The barrel deliberately exposed only `function` entries; with
  the typed-barrel machinery in place, adding constructor coverage is a
  small extension that fills a real DX gap.

## Phases

Four commits, each independently committable.

### Phase 1 — hex-string input

`src/primitives.ts`, `SPEC_HANDLERS`:

- `uint`: regex `/^\d+$/` → `/^(\d+|0x[0-9a-fA-F]+)$/`.
- `int`:  regex `/^-?\d+$/` → `/^(-?\d+|0x[0-9a-fA-F]+)$/`.

`BigInt(v)` already handles both `'100'` and `'0x64'` — no transform
change needed. Hex is always non-negative (no signed hex in JSON-RPC),
so the int regex puts the optional minus sign only on the decimal
branch.

**Tests:**
- `primitives.test.ts`: existing assertions that `'0x10'` is rejected
  flip to acceptance. Add cross-cases (lower/upper hex, leading-zero
  hex, hex-equal-to-max-for-width, hex-overflow-for-width).
- `primitives-source.test.ts`: equivalence holds — both runtime schema
  and source schema use the widened regex. The eval'd source should
  accept hex too.
- `primitives-spec.test.ts`: if any format-pinning test references the
  exact regex pattern, update it.

**Commit:**
`feat(primitives): accept hex-string input for uint/int schemas`

### Phase 2 — BigInt input

Add a new `ChainOp` variant in `src/primitives.ts`:

```ts
type ChainOp =
  | { readonly op: 'regex'; readonly pattern: RegExp; readonly message?: string }
  | { readonly op: 'transformBigInt' }
  | { readonly op: 'transformBigIntToNumber' }
  | { readonly op: 'transformHex' }
  | { readonly op: 'orBigInt' }            // <-- new
  | { readonly op: 'refineBigIntBound'; ... };
```

Handler in both interpreters:

- `applyChainZod`: `case 'orBigInt': return s.or(z.bigint());`
- `chainSource`:   `` case 'orBigInt': return `${s}.or(z.bigint())`; ``

The exhaustiveness `never` check on each interpreter's `default` will
compile-fail if either side is forgotten — that's the structural
guarantee the spec design exists for.

Insert `orBigInt` into each `uint` and `int` spec **between**
`transformBigInt` and `refineBigIntBound`, so the refine applies to
both union branches (each yields a `bigint`, so the predicate works
identically):

```ts
uint: (bits) => [
  { op: 'string' },
  { op: 'regex', pattern: /^(\d+|0x[0-9a-fA-F]+)$/, ... },
  { op: 'transformBigInt' },
  { op: 'orBigInt' },              // <-- new
  { op: 'refineBigIntBound', max: uintBound(bits), ... },
  ...(bits <= NUMBER_WIDTH_MAX ? [{ op: 'transformBigIntToNumber' } as const] : []),
],
```

Same shape for `int` (min + max bounds).

The order matters: `orBigInt` after `transformBigInt` means the string
branch produces a bigint first, then the union accepts either branch's
bigint, then `refineBigIntBound` validates the bound on the union's
output. For widths ≤48, the trailing `transformBigIntToNumber` applies
to the bound-validated bigint and narrows to `number`.

**Note on type inference:** the cast `as z.ZodType<AbiParameterToPrimitiveType<P>>`
on `buildSchema` doesn't change — abitype's inference is unchanged
(it's about the parsed *output* type, not the accepted input).
Accepting a wider input doesn't change the output shape.

**Tests:**
- `primitives.test.ts`: add bigint input cases for representative
  widths (uint8, uint256, int8, int256). Verify the bigint passes
  through, range check still applies (`primitiveSchema('uint8').parse(256n)`
  rejects, `primitiveSchema('uint8').parse(255n)` accepts).
- `primitives-source.test.ts`: equivalence — generated source's `.or(z.bigint())`
  branch behaves identically to runtime.
- `primitives-spec.test.ts`: a format-pinning test for the new op
  emitting `.or(z.bigint())` in source.

**Commit:**
`feat(primitives): accept bigint input for uint/int schemas via orBigInt op`

### Phase 3 — constructor schemas (runtime path)

`src/function.ts` / `src/abi.ts`:

Generalize the function-entry machinery to also handle constructor
entries. Two approaches; either is fine — pick the smaller diff:

**Option A:** generalize `SchemaFor<F>` to accept any abi item with
`readonly inputs: readonly AbiParameter[]`:

```ts
type SchemaFor<F extends { readonly inputs: readonly AbiParameter[] }> =
  z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>>;
```

Then `abiFunctionToZod` can take a constructor entry too (the internal
implementation doesn't read `name`).

**Option B:** add a separate `abiConstructorToZod` that mirrors
`abiFunctionToZod` minus the name handling.

Either way, the runtime change is small.

`Barrel<A>` type in `src/abi.ts`:

```ts
type ConstructorEntry<A extends Abi> = Extract<A[number], { type: 'constructor' }>;

type ConstructorKey<A extends Abi> = [ConstructorEntry<A>] extends [never]
  ? object
  : { readonly constructor: SchemaFor<ConstructorEntry<A>> };

export type Barrel<A extends Abi> = NameKeys<A> & SignatureKeys<A> & ConstructorKey<A>;
```

The `[T] extends [never]` wrap handles TS's conditional-type
distribution: when there's no constructor, `ConstructorKey` is `{}`
(no contribution); when there is one, it contributes a typed
`constructor` key.

`abiToZod` runtime: extract the constructor entry (if any) and assign
`out['constructor'] = schema`. Important: assigning the own property
`constructor` shadows `Object.prototype.constructor`. Verified safe;
`barrel.constructor` returns our schema at runtime, not the Object
constructor.

**Tests in `abi.test.ts`:**

```ts
it('exposes constructor schema when ABI has one', () => {
  const abi = [
    { type: 'constructor', inputs: [{ name: 'owner', type: 'address' }], stateMutability: 'nonpayable' },
    { type: 'function', name: 'foo', inputs: [], outputs: [], stateMutability: 'view' },
  ] as const satisfies Abi;
  const barrel = abiToZod(abi);
  expect(barrel.constructor.parse(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])).toEqual([
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  ]);
});

it('omits the constructor key when ABI has none', () => {
  const abi = [
    { type: 'function', name: 'foo', inputs: [], outputs: [], stateMutability: 'view' },
  ] as const satisfies Abi;
  const barrel = abiToZod(abi) as Record<string, unknown>;
  // Own-property check — Object.prototype.constructor leaks through if
  // we just read .constructor naïvely.
  expect(Object.hasOwn(barrel, 'constructor')).toBe(false);
});
```

**Commit:**
`feat(abi): expose constructor schemas in the typed barrel`

### Phase 4 — constructor schemas (codegen path)

`src/codegen.ts`:

If the ABI contains a constructor entry, emit it after the function
schemas section. Two pieces:

1. **A standalone export.** Like the per-function `<name>Schema`
   pattern: `export const constructorSchema = z.tuple([...]);` (or
   `z.strictObject({...})` if all named) rendered from the
   constructor's inputs. Position: after the last function's named
   export, before the barrel block.

2. **A barrel entry.** Insert `constructor: constructorSchema,` into
   the generated `schemas` object, after the signature keys and before
   the closing `} as const;`.

Section header for the new const is optional — if a section divider
helps readability, add a `// === Constructor schema ===` line.
Otherwise just emit the const directly. Match the visual style of the
existing sections.

Empty-input constructor: `z.tuple([])`. No special case needed; the
existing renderer handles it.

**Tests:**

- Add a small `as const` ABI with a constructor in
  `codegen.test.ts` and assert the generated source contains
  `constructorSchema` and `constructor: constructorSchema`.
- A snapshot test on a fixture that already has a constructor (most of
  the Arbitrum L1 fixtures do). Confirm output is stable.

**Fixture awareness:** many committed fixtures have constructor
entries. After Phase 4, regenerate goldens locally
(`npm run regenerate:golden`) and eyeball a constructor-bearing fixture
to confirm rendering. Goldens are gitignored — don't commit. If
`codegen.test.ts`'s equivalence test fails for any fixture, debug
before proceeding.

**Commit:**
`feat(codegen): emit constructorSchema and barrel entry for constructors`

## Verification

After all four phases:

- `npm run typecheck` clean.
- `npm test` green. All existing tests still pass; new tests for
  hex input, bigint input, and constructor schemas added.
- `viem-compat.test.ts` mapped-type assertions still hold. The
  function-focused assertions don't reference `constructor`. The
  input widening doesn't change the parse-output type that abitype
  cares about.
- Spot-check a generated fixture (Seaport, RollupAdminLogic) — struct
  components still render as `z.strictObject`; constructor schema (if
  present) renders cleanly.

## Files this will touch

Modified:
- `src/primitives.ts` (regex widening + new `orBigInt` op)
- `src/primitives.test.ts`
- `src/primitives-source.test.ts`
- `src/primitives-spec.test.ts`
- `src/abi.ts` (`Barrel<A>` type + runtime constructor assignment)
- `src/abi.test.ts`
- `src/function.ts` (if `SchemaFor` is generalized here)
- `src/codegen.ts`
- `src/codegen.test.ts`
- `src/__snapshots__/codegen.test.ts.snap` (snapshot updates from any
  format pinning that changed)

No new files.

## Open questions / decisions for the implementer

- **`SchemaFor` generalization location.** It currently lives in
  `src/abi.ts`. Could stay there or move to a shared types module.
  Either is fine; smaller diff wins.
- **Constructor barrel-entry placement in codegen output.** After
  signature keys is the proposed default. If the agent finds a more
  natural placement (e.g., a separate `constructor` block before the
  barrel), that's acceptable as long as it's consistent.
- **Snapshot test for constructor.** Add one explicitly if it helps
  human review; otherwise rely on the equivalence test for fixture
  constructors.

## Constraints

- **Don't widen scope.** No outputs, no events, no errors, no EIP-55,
  no `number`-as-int-input. Only the three items above.
- **No new helpers** unless the typechecker demands them.
- **Existing tests must stay green.** If a test fails for a reason
  unrelated to the three changes, stop and ask.
- **Goldens are gitignored** — don't commit any `test/fixtures-generated/`
  files.
- **The `Op` exhaustiveness check is load-bearing.** When adding
  `orBigInt`, the `never` checks in both `applyChainZod` and
  `chainSource` must fire if either is forgotten. Verify locally by
  temporarily removing one case and confirming TS errors before
  re-adding.

## Branch / PR

Branch: `feat/widen-and-constructors` (already created locally — push
it).
PR target: `main`.

Suggested PR title: `feat: accept hex/bigint input for ints; add constructor schemas`.
