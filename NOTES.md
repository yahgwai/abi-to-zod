# Implementation notes

Running log of tradeoffs and deviations from the plan. Filled in as work progresses.

## Phase 1 — fixtures

- Initial attempt installed `@arbitrum/nitro-precompile-interfaces` from npm as a devDep; not published there (404). Switched to using `@arbitrum/nitro-contracts` alone — it ships the precompile artifacts under `build/contracts/src/precompiles/*.sol/*.json` alongside the L1 contracts, so no separate forge build was needed.
- I initially hand-wrote the ERC20/721/1155 fixture JSONs from the EIP specs. Reverted on user request — all ABIs must be fetched from canonical sources (not hand-written), because fabricated ABIs risk subtle bugs (wrong types, missed fields, hand-copied mistakes) that compromise test validity.
