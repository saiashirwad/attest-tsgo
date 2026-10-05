# @texoport/attest

Type assertions backed by native TypeScript 7. Inspired by [@ark/attest](https://github.com/arktypeio/arktype/tree/main/ark/attest).

Experimental. Tested with TypeScript 7.0.2, using its unstable compiler API. Requires Node.js 20+.

## Use

In a test included by your `tsconfig.json`:

```ts
import { attest } from "@texoport/attest"

const count: number = 42
attest<number>(count).type.toString.snap("number")
attest(count).is(42)
```

Generate the type cache before running tests:

```sh
npx attest-tsgo precache -p tsconfig.json -o .attest/cache.json
```

Load it in your test setup:

```ts
import { loadCache } from "@texoport/attest"

loadCache(".attest/cache.json")
```

Run TypeScript tests directly on Node.js 24+:

```sh
node --import ./setup.ts --test ./test.ts
```

For compiled tests, enable `sourceMap` and run Node.js with `--enable-source-maps`. Regenerate the cache after changing test sources or TypeScript versions. Missing or stale cache entries fail the assertion.

## Assertions

- `attest<Expected>(value)` and `attest<Expected, Actual>()` compare types by mutual assignability, with separate handling for `any`.
- `.is(value)` and `.snap(value)` compare runtime values deeply.
- `.type.toString`, `.type.errors`, and `.jsdoc` support exact text checks with `.snap(text)` and substring checks with `.is(text)`.
- `.type.completions.snap(names)` checks sorted property completion names.
- `.throws(message)` checks a synchronous function's thrown message. `.throwsAndHasTypeError(message)` also checks for a compiler error inside the call.

Snapshots compare supplied values. They do not update source files. Calls must use the identifier `attest`, and test files must be roots in the selected tsconfig.

`measureInstantiations({ project, source, baseline, candidate })` compares two source strings through native `tsc` and returns their instantiation delta as `contributed`. It needs write access beside `source`. See the [measurement tests](test/measure.test.ts) for examples. These counts are not interchangeable with TypeScript 6 or @ark/attest benchmark baselines.

## Develop

Use Node.js 24+:

```sh
npm ci
npm test
```

The suite builds the library and tests compiler analysis, runtime assertions, measurements, and installation of the packed package.
