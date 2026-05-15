# abiToZod barrel + tight types plan

Self-contained plan for tightening runtime TS types and switching
`abiToZod` to a barrel API. Pick up from a fresh context window.

## Goal

The runtime path (`buildSchema` / `abiFunctionToZod` / `abiToZod`) currently
returns `z.ZodType` with loose types. Make it produce **the same TS types
abitype produces** from the same `as const` ABI, so:

- `z.infer<typeof schemas.transfer>` is the same type as
  `AbiParametersToPrimitiveTypes<ExtractAbiFunction<typeof abi, 'transfer'>['inputs']>`.
- `args: schemas.transfer.parse(...)` drops into `viem.encodeFunctionData`
  with no cast and no TS error.
- Build path and render (codegen) path produce identical TS types for the
  same input — no divergence.

Replace `abiToZod(abi, name)` with `abiToZod(abi)` returning a typed
barrel (name keys for unambiguous functions, signature keys for all).

## Hard constraints

- **Copy abitype's primitive type mapping exactly.** Whatever abitype's
  defaults produce (uint widths → `number` vs `bigint`, hex types, etc.),
  we match. This is a behavior change to our `SPEC_HANDLERS` if our
  current output type differs. Verify abitype's defaults in step 0.
- **`as const` ABIs in tests** — same pattern viem users have. Inline them
  in the test file.
- **Don't add mapped-type assertion helpers** unless typecheck failures
  genuinely require them. The plain `encodeFunctionData({ args: ... })`
  call is the test — if it compiles, types match.
- **No scope creep.** Hybrid `z.object` for named struct components is
  phase 2 (separate PR). Don't touch it here.

## Scope (in)

1. Make build-path types narrow via abitype's type utilities.
2. `abiToZod(abi)` returns typed barrel; drop the name/signature lookup
   form and the alias normalization (canonical keys only).
3. Update `SPEC_HANDLERS` if abitype's primitive mapping differs from
   our current output.
4. New `src/viem-compat.test.ts` with positional-only cases (every
   function in every fixture — runtime loop + a few explicit named
   calls for TS-level proof).
5. Gitignore `test/fixtures-generated/`, delete committed files, drop
   `src/golden.test.ts`. Keep `scripts/regenerate-golden.mjs` for
   manual eyeballing.

## Out of scope (phase 2 — separate PR)

- Hybrid `z.object` rendering for named struct components.
- viem-compat test cases for struct args (depend on the hybrid).
- Anything else.

## Steps

### Step 0 — verify abitype's primitive mapping

Read abitype's type definitions (`node_modules/abitype/dist/types/`) and
write down the exact mapping for each Solidity type:

- `uintN` and `intN` across all widths (8, 16, ..., 256). Find the
  threshold where the result switches between `number` and `bigint`
  (configurable via `Register['bigIntType']`; default behavior matters).
- `address` → ? (probably `` `0x${string}` ``).
- `bool` → `boolean`.
- `string` → `string`.
- `bytes` and `bytesN` → ? (probably `` `0x${string}` ``).
- Tuple components → object when all named, positional tuple otherwise
  (handled in phase 2; verify the type shape for both forms now).

If any default differs from our current `SPEC_HANDLERS` output, update
the spec to match. Note: changing `bigint` → `number` for small uints
is a runtime behavior change (parsed value's runtime type changes).
The `transformBigInt` op might need to become `transformNumber` for
some widths, or stay `bigint` if abitype's default is `bigint` across
the board.

### Step 1 — add deps

```
npm install abitype
npm install --save-dev viem
```

abitype's type utilities are pure types — use `import type` where
possible. viem is dev-only for the compat test.

### Step 2 — type-narrow the build path

`src/build.ts`:

```ts
import type { AbiParameter, AbiParameterToPrimitiveType } from 'abitype';

export function buildSchema<const P extends AbiParameter>(
  param: P,
): z.ZodType<AbiParameterToPrimitiveType<P>> {
  return doBuild(param) as z.ZodType<AbiParameterToPrimitiveType<P>>;
}
```

`src/function.ts`:

```ts
import type { AbiParametersToPrimitiveTypes } from 'abitype';

export function abiFunctionToZod<const F extends AbiFunctionEntry>(
  entry: F,
): z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>> {
  // runtime unchanged; cast at boundary
}
```

Use abitype's `AbiParameter` / `AbiFunctionEntry` types in the public
signatures. Internal types can stay as-is. The runtime code doesn't
change — only signatures plus one cast at each function's return.

### Step 3 — barrel `abiToZod`

`src/abi.ts`: rewrite signature and impl.

```ts
export function abiToZod<const A extends Abi>(abi: A): Barrel<A>;
```

`Barrel<A>` includes (use abitype's helpers — don't hand-roll):

- Name keys for unambiguous functions only, each typed as
  `z.ZodType<AbiParametersToPrimitiveTypes<F['inputs']>>`.
- Signature keys for every function (including overloads), same value
  type.

Runtime implementation:

1. Filter functions (existing `filterFunctions` helper).
2. Count occurrences of each name.
3. For each function, build schema via `abiFunctionToZod`, add
   signature key always, add name key only if the name occurs once.

Drop:
- The name/signature lookup form (`abiToZod(abi, name)`).
- `normalizeQuerySignature` — barrel keys are already canonical.
- Error throwing for unknown names / ambiguous names — accessor
  returns `undefined`.

Construction errors (malformed function entries) still throw at
`abiToZod(abi)` time — same as today.

### Step 4 — update existing callers

`src/abi.test.ts` (15 call sites):
- Rewrite to barrel form: `abiToZod(abi).transfer`, `abiToZod(abi)['balanceOf(address)']`.
- Drop tests that no longer apply:
  - "throws on unknown name" / "throws on unknown signature" → barrel
    accessor returns `undefined`. Replace with one or two assertions
    that confirm `barrel.unknown` is undefined.
  - "throws on ambiguous name" → ambiguous names just don't have a name
    key. Replace with assertion that `barrel.foo` is undefined when
    `foo` is overloaded, while both signature keys exist.
  - "normalizes uint alias in query signature" → barrel keys are
    canonical. Drop.
- Keep the construction-failure tests.

`src/integration.test.ts` (1 call site):
- Replace `abiToZod(abi, sig)` with `abiToZod(abi)[sig]`. Assert the
  schema is defined before using it.

### Step 5 — `src/viem-compat.test.ts`

Two flavors of coverage:

1. **TS-level: explicit named calls.** Inline ERC20 and ArbInfo as
   `as const`. For each function, one line:
   ```ts
   encodeFunctionData({
     abi: erc20Abi,
     functionName: 'transfer',
     args: schemas.transfer.parse(['0x...', '100']),
   });
   ```
   That call compiling **is** the assertion. If our types drift,
   `args` rejects the assignment.

2. **Runtime: loop over every JSON fixture.** For each of the 24
   fixtures, walk function entries, build placeholders, call
   `encodeFunctionData` with `args: schemas[sig]!.parse(placeholder)`.
   Loose-typed (since `Object.keys` widens), but catches runtime
   shape rejection across all ~280-ish functions.

Only include cases that pass today (positional primitives only).
**Don't include any struct-component cases** — those require the
phase 2 hybrid to compile.

If a test fails to compile, debug the type signatures — don't reach
for assertion helpers.

### Step 6 — gitignore golden output

```
echo "test/fixtures-generated/" >> .gitignore
git rm -r test/fixtures-generated/
rm src/golden.test.ts
```

Keep `scripts/regenerate-golden.mjs` and the `regenerate:golden` npm
script for manual inspection.

### Step 7 — verify

```
npm run typecheck
npm test
```

Expected test count: existing tests minus the 25 in `golden.test.ts`,
plus the new viem-compat tests. All green.

### Step 8 — `NOTES.md`

One short section: barrel API, abitype-typed runtime, viem-compat
test scaffolding (positional only, phase 2 follows). Note any
primitive mapping changes from step 0.

## Commit structure

Branch: `refactor/abi-barrel` (already created locally).
PR target: `feat/codegen`.

Commits (one per logical unit):

1. `chore(deps): add abitype, viem`
2. `refactor(primitives): align primitive type mapping with abitype` (only if step 0 found differences)
3. `refactor(types): narrow buildSchema and abiFunctionToZod via abitype`
4. `refactor(abi): abiToZod returns typed barrel; update callers`
5. `test(viem-compat): runtime + TS-level checks against viem.encodeFunctionData`
6. `chore: gitignore fixtures-generated; drop golden.test.ts`
7. `docs(notes): record barrel + tight-types refactor`

After each commit: typecheck + test. Don't move on with red.

## Files this will touch

New:
- `src/viem-compat.test.ts`

Modified:
- `package.json` (deps)
- `src/primitives.ts` (only if step 0 found differences)
- `src/build.ts` (generic signatures)
- `src/function.ts` (generic signatures)
- `src/abi.ts` (barrel rewrite)
- `src/abi.test.ts` (rewrite for barrel)
- `src/integration.test.ts` (one call site)
- `.gitignore`
- `NOTES.md`

Deleted:
- `src/golden.test.ts`
- `test/fixtures-generated/**/*.ts`

## Open question I want to flag mid-execution, not pre-flight

If abitype's primitive mapping diverges from ours in a way that
breaks existing integration tests (e.g. small uints become `number`
and runtime fixture parsing breaks because we pass string `'0'` and
abitype expects number), stop and ask. The fix might be widening our
input acceptance or aligning the spec — the right call depends on what
the divergence is.
