import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { analyzeProject, type Relationship } from "../src/analyze.ts"

const config = fileURLToPath(new URL("./fixtures/analyze.tsconfig.json", import.meta.url))
const source = readFileSync(new URL("./fixtures/analyze.ts", import.meta.url), "utf8")
const cache = analyzeProject(config)
const assertions = new Map(cache.assertions.map(record => [source.slice(record.start, record.end), record]))

const relationships = [
  { call: "attest<number>(input)", type: "number", expected: "number", relationship: "equality" },
  { call: "attest<string>(input)", type: "number", expected: "string", relationship: "none" },
  { call: "attest<string, number>()", type: "number", expected: "string", relationship: "none" },
  { call: "attest<number, 1>()", type: "1", expected: "number", relationship: "subtype" },
  { call: "attest<1, number>()", type: "number", expected: "1", relationship: "supertype" },
  { call: "attest<any, any>()", type: "any", expected: "any", relationship: "equality" },
  { call: "attest<string, any>()", type: "any", expected: "string", relationship: "supertype" },
  { call: "attest<any, string>()", type: "string", expected: "any", relationship: "subtype" },
  { call: "attest<unknown, string>()", type: "string", expected: "unknown", relationship: "subtype" },
  { call: "attest<string, unknown>()", type: "unknown", expected: "string", relationship: "supertype" },
  { call: "attest<string, never>()", type: "never", expected: "string", relationship: "subtype" },
  { call: "attest<never, string>()", type: "string", expected: "never", relationship: "supertype" },
  { call: "attest<string, MissingActual>()", type: "MissingActual", expected: "string", relationship: "none" },
  { call: "attest<MissingExpected, string>()", type: "string", expected: "MissingExpected", relationship: "none" }
] satisfies { call: string; type: string; expected: string; relationship: Relationship }[]

for (const { call, type, expected, relationship } of relationships) {
  test(`analyzes ${call} as ${relationship}`, () => {
    const record = assertions.get(call)
    assert.ok(record, `Missing assertion for ${call}`)
    assert.deepEqual({ type: record.type, expected: record.expected, relationship: record.relationship }, {
      type,
      expected,
      relationship
    })
  })
}

test("reports argument errors on the assertion that contains them", () => {
  assert.equal(assertions.get("attest<number>(input)")?.errors, "")
  assert.equal(assertions.get("attest<string>(input)")?.errors, "Argument of type 'number' is not assignable to parameter of type 'string'.")
  assert.equal(assertions.get("attest<string, MissingActual>()")?.errors, "Cannot find name 'MissingActual'.")
  assert.equal(assertions.get("attest<MissingExpected, string>()")?.errors, "Cannot find name 'MissingExpected'.")
})

test("offers property completions at an unfinished property access", () => {
  assert.deepEqual(assertions.get("attest(item.al)")?.completions, ["alpha", "beta"])
})

test("extracts argument documentation without inventing an expected type", () => {
  const record = assertions.get("attest(input)")
  assert.ok(record)
  assert.equal(record.jsdoc, "A documented input.")
  assert.equal(record.type, "number")
  assert.equal(record.expected, undefined)
  assert.equal(record.relationship, undefined)
})
