# @texoport/attest

Type assertions backed by native TypeScript 7. Inspired by [@ark/attest](https://github.com/arktypeio/arktype/tree/main/ark/attest).

> Experimental · TypeScript 7.0.2 · Node.js 20+
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

Regenerate the cache after changing test sources or TypeScript versions. Missing or stale entries fail the assertion.

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
| `.type.completions.snap(names)` | Sorted property completion names |
| `.throws(message)` | A synchronous function's thrown message |
| `.throwsAndHasTypeError(message)` | Thrown message and a compiler error |

Text assertions use `.snap(text)` for an exact match or `.is(text)` for a substring. Type assertions check mutual assignability, with separate handling for `any`.

Snapshots compare supplied values without updating source files. Calls must use the identifier `attest`, and test files must be roots in the selected tsconfig.

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

`baseline` and `candidate` are complete source strings. `contributed` is the candidate's instantiation count minus the baseline's. See the [measurement tests](test/measure.test.ts) for examples.

Measurement needs write access beside `source`. Counts are not interchangeable with TypeScript 6 or @ark/attest benchmark baselines.

## Develop

Use Node.js 24+:

```sh
npm ci
npm test
```

The suite builds the library and tests compiler analysis, runtime assertions, measurements, and installation of the packed package.
