import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, beforeEach, describe, test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"
import { loadCache } from "../src/index.ts"
import { passes, failsType, failsSubtype, failsSupertype, failsAny, failsSnapshot, checksSuppressedError, checksBoth, failsMissingTypeError, failsMissingRuntimeError, checksEditorData, checksNested } from "./fixtures/typed.ts"

const project = fileURLToPath(new URL("./fixtures/typed.tsconfig.json", import.meta.url))
const source = fileURLToPath(new URL("./fixtures/typed.ts", import.meta.url))
const text = readFileSync(source, "utf8")
const good = analyzeProject(project)
const directory = mkdtempSync(join(tmpdir(), "attest-tsgo-typed-"))
const output = join(directory, "cache.json")
after(() => rmSync(directory, { recursive: true, force: true }))

describe("typed runtime assertions", () => {
  beforeEach(() => {
    writeFileSync(output, JSON.stringify(good))
    loadCache(output)
  })

  test("equal types, values, and documented inputs pass", passes)
  test("suppressed compiler errors reach runtime assertions", checksSuppressedError)
  test("property documentation and sorted completions reach runtime assertions", checksEditorData)
  test("nested calls and columns after emoji resolve independently", checksNested)

  for (const { name, run, message } of [
    { name: "unrelated types", run: failsType, message: /number is none to string/ },
    { name: "strict subtypes", run: failsSubtype, message: /is subtype to string/ },
    { name: "strict supertypes", run: failsSupertype, message: /string is supertype/ },
    { name: "any as a substitute for a concrete type", run: failsAny, message: /any is supertype to string/ },
    { name: "incorrect type snapshots", run: failsSnapshot, message: /Type: expected "string", got "number"/ }
  ]) {
    test(`rejects ${name}`, () => assert.throws(run, message))
  }

  test("combined assertions require both runtime and compiler errors", () => {
    checksBoth()
    checksBoth(/not assignable/g)
    assert.throws(failsMissingTypeError, /Type errors did not match/)
    assert.throws(failsMissingRuntimeError, /Expected function to throw/)
  })

  for (const { name, call, run } of [
    { name: "inner nested call", call: 'attest(value).type.toString.is("number")', run: checksNested },
    { name: "second call on the same line", call: 'attest(label).type.toString.snap("string")', run: passes },
    { name: "call after an emoji", call: 'attest(value).type.toString.snap("number")\n  void emoji', run: checksNested }
  ]) {
    test(`cannot substitute another record for a missing ${name}`, () => {
      const position = text.indexOf(call)
      assert.notEqual(position, -1)
      const record = good.assertions.find(record => record.file === source && record.start === position)
      assert.ok(record)
      writeFileSync(output, JSON.stringify({ ...good, assertions: good.assertions.filter(entry => entry !== record) }))
      loadCache(output)
      assert.throws(run, /No cached attest call/)
    })
  }
})
