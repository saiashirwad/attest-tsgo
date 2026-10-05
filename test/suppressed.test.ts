import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"

const config = fileURLToPath(new URL("./fixtures/suppressed.tsconfig.json", import.meta.url))

test("recovers suppressed errors without changing source positions or string literals", () => {
  const cache = analyzeProject(config)
  assert.equal(cache.assertions.length, 1)
  assert.equal(cache.assertions[0].line, 3)
  assert.equal(cache.assertions[0].errors, "Type 'number' is not assignable to type 'string'.")
})
