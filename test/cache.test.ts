import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"
import { loadCache } from "../src/index.ts"

test("the complete project manifest is checked before any assertion", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-cache-"))
  try {
    const config = join(dir, "tsconfig.json")
    const main = join(dir, "main.ts")
    const sibling = join(dir, "sibling.ts")
    const intermediate = join(dir, "intermediate.ts")
    const dependency = join(dir, "dependency.ts")
    const declaration = join(dir, "types.d.ts")
    const cachePath = join(dir, "cache.json")
    writeFileSync(config, JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ["main.ts", "sibling.ts"] }))
    writeFileSync(main, 'import type { Result } from "./intermediate.js"\nimport type { Ambient } from "./types.js"\ndeclare function attest<A, B>(): void\nattest<Result, number>()\nattest<Ambient, string>()\n')
    writeFileSync(sibling, "export type Sibling = number\n")
    writeFileSync(intermediate, 'export type { Result } from "./dependency.js"\n')
    writeFileSync(dependency, "export type Result = number\n")
    writeFileSync(declaration, "export type Ambient = string\n")
    const original = analyzeProject(config)
    assert.equal(original.assertions.length, 2)
    assert.ok(original.sources[dependency])
    assert.ok(original.sources[intermediate])
    assert.ok(original.sources[declaration])
    assert.ok(original.sources[sibling])
    assert.deepEqual(original.roots.sort(), [main, sibling].sort())
    writeFileSync(cachePath, JSON.stringify(original))
    loadCache(cachePath)
    for (const file of [main, sibling, intermediate, dependency, declaration, config]) {
      const before = readFileSync(file)
      writeFileSync(file, Buffer.concat([before, Buffer.from("\n")]))
      assert.throws(() => loadCache(cachePath), /Stale or missing attest-tsgo cache.*rerun precache/)
      writeFileSync(file, before)
      loadCache(cachePath)
    }
    writeFileSync(cachePath, JSON.stringify({ ...original, compiler: "7.0.999" }))
    assert.throws(() => loadCache(cachePath), /Invalid or incompatible.*rerun precache/)
    const base = join(dir, "base.json")
    writeFileSync(base, JSON.stringify({ compilerOptions: { strict: true } }))
    writeFileSync(config, JSON.stringify({ extends: "./base.json", files: ["main.ts", "sibling.ts"] }))
    writeFileSync(cachePath, JSON.stringify(analyzeProject(config)))
    loadCache(cachePath)
    writeFileSync(base, JSON.stringify({ compilerOptions: { strict: false } }))
    assert.throws(() => loadCache(cachePath), /Stale or missing attest-tsgo cache.*rerun precache/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
