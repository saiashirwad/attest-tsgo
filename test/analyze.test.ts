import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"

const config = fileURLToPath(new URL("./fixtures/analyze.tsconfig.json", import.meta.url))

test("analyzes native types and distinguishes equal from unrelated types", () => {
  const cache = analyzeProject(config)
  assert.equal(cache.compiler, "7.0.2")
  assert.equal(cache.assertions.length, 5)
  const [equal, unrelated, completion, documentation, typeOnly] = cache.assertions
  assert.equal(equal.type, "number")
  assert.equal(equal.relationship, "equality")
  assert.equal(unrelated.expected, "string")
  assert.equal(unrelated.relationship, "none")
  assert.match(unrelated.errors, /not assignable to parameter of type 'string'/)
  assert.ok(completion.completions.includes("alpha"))
  assert.ok(completion.completions.includes("beta"))
  assert.equal(documentation.jsdoc, "A documented input.")
  assert.equal(typeOnly.type, "number")
  assert.equal(typeOnly.relationship, "none")
})
