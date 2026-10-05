import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"
import { loadCache } from "../src/index.ts"

const config = fileURLToPath(new URL("./fixtures/runtime.tsconfig.json", import.meta.url))

test("runtime assertions use precached native results and fail on incorrect expectations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "attest-tsgo-"))
  try {
    const path = join(directory, "cache.json")
    const good = analyzeProject(config)
    writeFileSync(path, JSON.stringify(good))
    loadCache(path)
    const { succeeds, fails } = await import("./fixtures/runtime.mjs")
    succeeds()
    assert.throws(fails, /Type: expected "string", got "number"/)
    writeFileSync(path, JSON.stringify({ ...good, assertions: [] }))
    loadCache(path)
    assert.throws(succeeds, /No cached attest call/)
    writeFileSync(path, JSON.stringify({ ...good, sources: { ...good.sources, [good.assertions[0].file]: "wrong" } }))
    loadCache(path)
    assert.throws(succeeds, /Stale or missing attest-tsgo cache/)
    writeFileSync(path, JSON.stringify({ schema: 1, compiler: "6.0.2", sources: {}, assertions: [] }))
    assert.throws(() => loadCache(path), /Invalid or incompatible/)
    writeFileSync(path, JSON.stringify({ ...good, assertions: [{ ...good.assertions[0], end: undefined }] }))
    assert.throws(() => loadCache(path), /Invalid or incompatible/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
