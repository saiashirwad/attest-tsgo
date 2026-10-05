import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, beforeEach, describe, test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"
import { attest, loadCache } from "../src/index.ts"
import { assertionFor, comparisons, hostileInspection, succeeds, fails } from "./fixtures/runtime.mjs"

const config = fileURLToPath(new URL("./fixtures/runtime.tsconfig.json", import.meta.url))

const good = analyzeProject(config)
const directory = mkdtempSync(join(tmpdir(), "attest-tsgo-"))
const path = join(directory, "cache.json")
after(() => rmSync(directory, { recursive: true, force: true }))

test("assertions require a loaded cache", () => {
  assert.throws(() => attest(1), /No attest-tsgo cache loaded/)
})

describe("runtime assertions", () => {
  beforeEach(() => {
    writeFileSync(path, JSON.stringify(good))
    loadCache(path)
  })

  test("JavaScript calls use native type results", () => {
    succeeds()
    assert.throws(fails, /Type: expected "string", got "number"/)
  })

  test("value assertions compare nested values strictly", () => {
    assertionFor({ items: [1, { ready: true }] }).is({ items: [1, { ready: true }] })
    assertionFor({ items: [1] }).snap({ items: [1] })
    assert.throws(() => assertionFor({ items: [1] }).is({ items: ["1"] }), /Value: expected/)
    assert.throws(() => assertionFor({ items: [1] }).snap({ items: [2] }), /Value snapshot: expected/)
  })

  test("BigInt, circular and collection mismatches remain assertion failures", () => {
    const cases = comparisons()
    for (const [name, run] of Object.entries(cases)) {
      assert.throws(run, error => error instanceof assert.AssertionError && error.message.startsWith("Value: expected "), name)
    }
  })

  test("custom inspection hooks cannot replace assertion failures", () => {
    assert.throws(hostileInspection, error => error instanceof assert.AssertionError && !error.message.includes("inspect hook ran"))
  })

  test("text assertions distinguish substrings from exact snapshots", () => {
    assertionFor(42).type.toString.is("know")
    assertionFor(42).type.toString.snap("unknown")
    assert.throws(() => assertionFor(42).type.toString.snap("know"), /Type: expected/)
    assert.throws(() => assertionFor(42).type.toString.is("string"), /Type: expected to contain/)
    assert.throws(() => assertionFor(42).jsdoc.snap("invented documentation"), /JSDoc: expected/)
    assert.throws(() => assertionFor(42).type.errors.is("invented diagnostic"), /Type errors: expected to contain/)
  })

  test("throws accepts Error messages, thrown values, and repeated regex matches", () => {
    const fail = () => { throw new Error("something broke") }
    assertionFor(fail).throws("broke")
    const pattern = /broke/g
    assertionFor(fail).throws(pattern)
    assertionFor(fail).throws(pattern)
    assertionFor(() => { throw "plain failure" }).throws("plain")
    assertionFor(() => { throw undefined }).throws()
  })

  test("throws rejects non-functions, successful functions, and wrong messages", () => {
    assert.throws(() => assertionFor(42).throws(), /Expected a function/)
    assert.throws(() => assertionFor(() => {}).throws(), /Expected function to throw/)
    assert.throws(() => assertionFor(() => { throw new Error("actual") }).throws("expected"), /Thrown message did not match/)
  })

  test("missing assertion entries fail even when the source hash matches", () => {
    writeFileSync(path, JSON.stringify({ ...good, assertions: [] }))
    loadCache(path)
    assert.throws(succeeds, /No cached attest call/)
  })

  test("reloading clears previously checked source hashes", () => {
    succeeds()
    const record = good.assertions[0]
    assert.ok(record)
    writeFileSync(path, JSON.stringify({ ...good, sources: { ...good.sources, [record.file]: "wrong" } }))
    assert.throws(() => loadCache(path), /Stale or missing attest-tsgo cache/)
    assert.throws(succeeds, /No attest-tsgo cache loaded/)
  })
})

describe("cache validation", () => {
  const record = good.assertions[0]
  assert.ok(record)
  const invalidCaches = [
    { name: "compiler mismatch", data: { ...good, compiler: "incompatible" } },
    { name: "unknown schema", data: { ...good, schema: 2 } },
    { name: "missing project", data: { ...good, config: undefined } },
    { name: "non-string source hash", data: { ...good, sources: { [record.file]: 42 } } },
    { name: "assertion without a source hash", data: { ...good, sources: {} } },
    { name: "missing end position", data: { ...good, assertions: [{ ...record, end: undefined }] } },
    { name: "invalid completion", data: { ...good, assertions: [{ ...record, completions: [42] }] } },
    { name: "unknown relationship", data: { ...good, assertions: [{ ...record, expected: "string", relationship: "invalid" }] } },
    { name: "expected type without relationship", data: { ...good, assertions: [{ ...record, expected: "string" }] } },
    { name: "relationship without expected type", data: { ...good, assertions: [{ ...record, relationship: "none" }] } }
  ]

  for (const { name, data } of invalidCaches) {
    test(`rejects ${name}`, () => {
      writeFileSync(path, JSON.stringify(data))
      assert.throws(() => loadCache(path), /Invalid or incompatible attest-tsgo cache/)
    })
  }

  test("rejects invalid JSON and clears the loaded cache", () => {
    writeFileSync(path, "{broken")
    assert.throws(() => loadCache(path), /Invalid or missing attest-tsgo cache.*rerun precache/)
    assert.throws(succeeds, /No attest-tsgo cache loaded/)
  })
})
