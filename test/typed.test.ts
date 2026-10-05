import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { loadCache } from "../src/index.ts"

const project = fileURLToPath(new URL("./fixtures/typed.tsconfig.json", import.meta.url))
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))

test("precache CLI supplies native assertions to TypeScript", async () => {
  const directory = mkdtempSync(join(tmpdir(), "attest-tsgo-cli-"))
  try {
    const output = join(directory, "cache.json")
    const text = execFileSync(process.execPath, [cli, "precache", "-p", project, "-o", output], { encoding: "utf8" })
    assert.match(text, /Cached 15 assertions from TypeScript 7\.0\.2/)
    const good = JSON.parse(readFileSync(output, "utf8"))
    assert.equal(good.assertions.length, 15)
    loadCache(output)
    const { passes, failsType, failsSnapshot, checksSuppressedError, checksBoth, failsMissingTypeError, checksEditorData, checksNested } = await import("./fixtures/typed.ts")
    passes()
    checksSuppressedError()
    checksBoth()
    checksEditorData()
    checksNested()
    assert.throws(failsMissingTypeError, /Type errors did not match/)
    assert.throws(failsType, /number is none to string/)
    assert.throws(failsSnapshot, /Type: expected "string", got "number"/)
    const nested = good.assertions.filter(record => record.line === 54).sort((a, b) => a.start - b.start)
    assert.equal(nested.length, 2)
    writeFileSync(output, JSON.stringify({ ...good, assertions: good.assertions.filter(record => record !== nested[1]) }))
    loadCache(output)
    assert.throws(checksNested, /No cached attest call/)
    const sameLine = good.assertions.filter(record => record.line === 15)
    assert.equal(sameLine.length, 2)
    writeFileSync(output, JSON.stringify({ ...good, assertions: good.assertions.filter(record => record !== sameLine[1]) }))
    loadCache(output)
    assert.throws(passes, /No cached attest call/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
