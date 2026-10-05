# Attest on native TypeScript

This repository started empty. The library reads types from the selected TypeScript 7 compiler, precaches assertion data, and provides synchronous assertions at test runtime. The tested compiler version is 7.0.2; its API is unstable.

Definition of done for the first usable release: a caller can run `precache` against a TypeScript 7 project and then use the familiar `attest(value).type` assertions in a real test. Wrong types and missing cached results must fail. `npm test` must run against the native compiler and check those failures. Features that cannot be measured faithfully must be reported, not fabricated.

The source is a new library, not a copy of `ark/attest`. Five reviewable units:

1. Capture an executable TypeScript 7.0.2 API baseline.
2. Build a native analyzer for type relationships, rendered types, diagnostics, completions, and documentation.
3. Serialize analysis and consume it in synchronous assertions, including failure cases.
4. Add an end-to-end `precache` CLI and verify a real compiled fixture.
5. Add isolated native instantiation measurements and document remaining limitations.

The five units are committed. Suppressed diagnostics and cache failure checks were added as separate units. `measureInstantiations` implements an explicit CLI contrast, not Attest's inline benchmark contract. See the README for the supported assertions and current limits.

Rigor is high for compiler-sourced data and benchmark claims: use asymmetric assertions, errors, and a real compiler invocation. Keep the result and the per-unit evidence in `DECISIONS.tsv`. Do not rely on the closed `typescript-go` staging repository or on an unpublished Go API.
