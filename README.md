# attest-tsgo

Type assertions for projects using native TypeScript 7. This is a new, experimental library inspired by [`@ark/attest`](https://github.com/arktypeio/arktype/tree/main/ark/attest), not a drop-in replacement. It reads types through the compiler shipped in `typescript`, writes assertion results to a cache, and runs the assertions synchronously in your tests. It has been tested with TypeScript **7.0.2**; the compiler API it uses is explicitly unstable.

## Run a type assertion

From this checkout, install dependencies and build the library:

```sh
npm ci
npm run build
```

In a TypeScript test included by your `tsconfig.json`:

```ts
import { attest } from "attest-tsgo"

const count: number = 42
attest<number>(count).type.toString.snap("number")
attest(count).is(42)
```

Precache before running the test. Load the cache from a setup file before any assertion runs:

```ts
import { loadCache } from "attest-tsgo"

loadCache(".attest/cache.json")
```

On Node.js 24+, run the TypeScript test directly:

```sh
node dist/cli.js precache -p path/to/tsconfig.json -o .attest/cache.json
node --import ./path/to/setup.ts --test ./path/to/test.ts
```

If you compile the test instead, set `sourceMap: true` and run the emitted JavaScript with source maps so its stack frames point to the TypeScript source:

```sh
node dist/cli.js precache -p path/to/tsconfig.json -o .attest/cache.json
node --enable-source-maps --import ./path/to/compiled-setup.js --test ./path/to/compiled-test.js
```

The CLI scans root files in the selected project for calls named `attest`. The cache records the compiler version, source hashes, and assertion positions. A missing call, changed source file, or compiler mismatch fails with an error rather than treating the assertion as passing. Run `precache` again after editing a test or changing TypeScript versions. See [`test/fixtures/typed.ts`](test/fixtures/typed.ts) and [`test/typed.test.ts`](test/typed.test.ts) for an executable example.

## Supported assertions

- `attest<Expected>(value)` and `attest<Expected, Actual>()` compare types by mutual assignability, with separate treatment for `any`. Mismatches throw at runtime. `attest(value).is(expected)` and `.snap(expected)` compare runtime values deeply.
- `.type.toString.snap(text)`, `.type.errors.snap(text)`, and `.jsdoc.snap(text)` check exact text. Their `.is(text)` variants check whether the result contains text. `.throws(message)` checks a synchronous function's thrown message; `.throwsAndHasTypeError(message)` checks both that message and a compiler error inside the call.
- `.type.completions.snap(names)` checks the sorted completion names for a property access passed to `attest`. Pass the full array.
- `.type.errors` reads diagnostics inside the assertion call. For `@ts-expect-error` and `@ts-ignore`, precache uses an in-memory, same-length comment edit to recover the suppressed diagnostic without changing the source file or assertion positions.

Snapshot methods compare against values you provide; they do not write or update inline snapshots.

## Measure instantiations

`measureInstantiations` compares two isolated versions of one source file. Both runs use the selected native `tsc` with `--noEmit --extendedDiagnostics --singleThreaded`. The function creates temporary files beside `source` to preserve relative imports and removes them after the check.

```ts
import { readFileSync } from "node:fs"
import { measureInstantiations } from "attest-tsgo"

const source = "src/types.ts"
const baseline = readFileSync(source, "utf8")
const measurement = measureInstantiations({
  project: "tsconfig.json",
  source,
  baseline,
  candidate: baseline + "\ntype AttestExample<T> = { value: T }\nconst example: AttestExample<string> = { value: 'hello' }\n"
})
if (measurement.contributed > 100) throw new Error("Type budget exceeded")
```

Provide both source versions explicitly. A compiler error or missing statistics fails the measurement; an unchanged or cheaper candidate may legitimately have a zero or negative delta. The returned `algorithm` identifies this CLI measurement. Its numbers are **not interchangeable** with JavaScript TypeScript 6's `getInstantiationCount()` or with Attest's inline benchmark baselines.

## Current limits

There is no `attest.instantiations`, `bench(...).types(...)`, cross-version cache, inline snapshot writer, or Attest trace command. Completion capture currently targets property access, not every editor completion context. Test files must be roots in the chosen tsconfig, and calls must use the identifier `attest`. Diagnostics use the native compiler's message text and may differ from older TypeScript versions. Benchmarking needs write access beside the source file. TypeScript 7.1 and later need their own API and parity checks before claiming support.

## Verify from this checkout

Use Node.js 24+ to run `npm test` from this checkout. The package declares Node.js 20+ support, but the repository tests use Node's built-in TypeScript support. The command builds the library, type-checks the fixture without emitting it, and runs the `.ts` tests against the source. The tests check compiler analysis, runtime failures, and native instantiation measurements. They also pack the built library and install it with the local TypeScript dependency in a temporary project. That project compiles against the package, runs its `precache` bin, passes an assertion, rejects a type mismatch, and rejects a changed source file. The install uses `--offline`; it does not publish or fetch from the registry.

To rerun only the installed-package check after an edit, run `npm run build && node --test test/package.test.ts`. The reviewable decision history is in [`DECISIONS.tsv`](DECISIONS.tsv).
