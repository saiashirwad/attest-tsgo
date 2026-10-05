# @texoport/attest

Type assertions backed by native TypeScript 7. Inspired by [@ark/attest](https://github.com/arktypeio/arktype/tree/main/ark/attest).

> Experimental · TypeScript 7.0.2 · Node.js 20.19+
>
> Uses TypeScript's unstable compiler API.

## Use

Add assertions to a test included by your `tsconfig.json`.

```ts
import { attest } from "@texoport/attest"

const count: number = 42
attest<number>(count).type.toString.snap("number")
attest(count).is(42)
```

Load the cache in `setup.ts`.

```ts
import { loadCache } from "@texoport/attest"

loadCache(".attest/cache.json")
```

Generate the cache, then run your tests. This example uses Node.js 24+.

```sh
npx attest-tsgo precache -p tsconfig.json -o .attest/cache.json
node --import ./setup.ts --test ./test.ts
```

Precache checks the selected tsconfig and fails if it finds no assertions. Pass `--allow-empty` to permit an empty project. The cache tracks the tsconfig, effective compiler configuration, roots, and all source and declaration files in the native program. `loadCache` checks the complete manifest once before any assertion runs. Regenerate the cache after changing these inputs.

Package-resolution metadata that the compiler did not include as a source file, such as a dependency's `package.json`, is not tracked. Newly added files discovered only by module resolution are not tracked until the next precache. Either change can affect types without invalidating the cache. Re-run precache after installing or updating dependencies.

For compiled tests, enable `sourceMap` and run Node.js with `--enable-source-maps`.

## Assertions

| Assertion | Checks |
| --- | --- |
| `attest<Expected>(value)` | Type of a value |
| `attest<Expected, Actual>()` | Two types |
| `.is(value)` or `.snap(value)` | Deep value equality |
| `.type.toString` | Type text |
| `.type.errors` | Compiler diagnostics inside the call |
| `.jsdoc` | Documentation text |
| `.type.completions.snap(names)` | Sorted completion names for a direct property access |
| `.type.completionQueries.snap(queries)` | Results and source offsets for each property, string, or template completion query inside the call |
| `.throws(message)` | A synchronous function's thrown message |
| `.throwsAndHasTypeError(message)` | Thrown message and a compiler error |

Text assertions use `.snap(text)` for an exact match or `.is(text)` for a substring. Type assertions check mutual assignability, with separate handling for `any`.

`completionQueries` preserves each query separately. Each entry has a zero-based `position` and a `kind` of `results` (with sorted `entries`), `empty`, or `unsupported`. Calls without a candidate contain `{ kind: "not-queried" }`. `.type.completions.snap` rejects calls without a direct property query rather than accepting `[]`. Completion availability depends on the native compiler's contextual type at the position.

Snapshots compare supplied values without updating source files. Calls must use the identifier `attest`, and assertion discovery only scans root files in the selected tsconfig. Imported files affect cache validity but do not supply assertions. `@ts-expect-error`, `@ts-ignore`, and `@ts-nocheck` in comments are neutralized in a diagnostic-only copy so `.type.errors` can inspect suppressed type errors.

## Measure instantiations

Compare two versions of a source file through native `tsc`.

```ts
import { measureInstantiations } from "@texoport/attest"

const { contributed } = measureInstantiations({
	project: "tsconfig.json",
	source: "src/types.ts",
	baseline,
	candidate,
})
```

`baseline` and `candidate` are complete source strings. `contributed` is the candidate's instantiation count minus the baseline's. Results also include the compiler version, configuration fingerprint, and algorithm. See the [measurement tests](test/measure.test.ts) for examples.

Measurements currently require a single-root, self-contained project. Imports and extra roots, including ambient declarations, fail explicitly because a sibling synthetic file cannot safely replace the original module in those projects. Declaration files are unsupported. The backend forces type checking even when the project enables `noCheck`, sets a 30-second default timeout, and cleans up synthetic files on success or failure. It never overwrites `source`. Measurement needs write access beside `source`. Counts are not interchangeable with TypeScript 6 or @ark/attest benchmark baselines.

## Develop

Use Node.js 24+:

```sh
npm ci
npm test
```

The suite builds the library and tests compiler analysis, runtime assertions, measurements, and installation of the packed package. CI runs the suite on Ubuntu with Node 24 and TypeScript 7.0.2, then runs the packed JavaScript test on Node 20.19.0.
