# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Every named parameter's Zod schema now carries a `.describe('<name>: <canonicalType>')` annotation, available at runtime via `schema.description`. Applies to function inputs (tuple items), named struct components (object values and the surrounding object), and named arrays. Unnamed parameters are left without a description.
- Generated source no longer emits `/* name: type */` comments inside tuples — the same information is on `.describe()` instead.

## [0.1.0] - 2026-05-18

Initial release.

### Added
- `buildSchemas(abi)` — build a typed table of Zod schemas for an ABI's function inputs, keyed by both unambiguous function name and canonical signature.
- `buildFunctionInputsSchema(entry)` — build a Zod tuple schema for a single function entry's inputs.
- `buildParamSchema(param)` — build a Zod schema for an individual ABI parameter (including nested tuples and arrays).
- `renderSchemas(abi)` — emit a TypeScript source file of Zod schemas for an ABI, suitable for committing alongside generated bindings.
- `abi-to-zod` CLI — `abi-to-zod <input-abi.json> [output.ts]` to render schemas to stdout or a file.
- Type-level `SchemaTable<A>` so consumers get exact inferred input types for each function.
- Compatibility with `abitype`/`viem` ABI shapes.

[Unreleased]: https://github.com/yahgwai/abi-to-zod/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yahgwai/abi-to-zod/releases/tag/v0.1.0
