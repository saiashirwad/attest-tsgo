import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, test } from "node:test"
import { measureInstantiations } from "../src/index.ts"

const baseline = readFileSync(new URL("./fixtures/measure.ts", import.meta.url), "utf8")
const candidate = baseline + 'const result: Wrap<string> = { value: "hello" }\n'
let directory: string
let source: string
let project: string

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "attest-tsgo-measure-")))
  source = join(directory, "measure.ts")
  project = join(directory, "tsconfig.json")
  writeFileSync(source, baseline)
  writeFileSync(project, JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ["measure.ts"] }))
})

afterEach(() => {
  try {
    assert.deepEqual(readdirSync(directory), ["measure.ts", "tsconfig.json"])
    assert.equal(readFileSync(source, "utf8"), baseline)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("adding a generic instantiation produces a repeatable positive contribution", () => {
  const input = { project, source, baseline, candidate }
  const first = measureInstantiations(input)
  const second = measureInstantiations(input)
  assert.equal(first.algorithm, "native-cli-isolated-v2")
  assert.equal(first.compiler, "7.0.2")
  assert.match(first.configFingerprint, /^[a-f0-9]{64}$/)
  assert.ok(first.contributed > 0)
  assert.equal(first.contributed, first.candidate - first.baseline)
  assert.deepEqual(second, first)
})

test("identical source versions contribute zero instantiations", () => {
  const result = measureInstantiations({ project, source, baseline, candidate: baseline })
  assert.equal(result.candidate, result.baseline)
  assert.equal(result.contributed, 0)
})

test("removing an instantiation produces a negative contribution", () => {
  const result = measureInstantiations({ project, source, baseline: candidate, candidate: baseline })
  assert.ok(result.contributed < 0)
  assert.equal(result.contributed, result.candidate - result.baseline)
})

for (const stage of ["baseline", "candidate"]) {
  test(`reports ${stage} compiler errors and cleans up synthetic files`, () => {
    assert.throws(() => measureInstantiations({
      project, source, baseline, candidate, [stage]: baseline + "const invalid: string = 42\n"
    }), /Native TypeScript measurement failed.*not assignable/s)
  })
}

test("measurement times out and cleans up", () => {
  assert.throws(() => measureInstantiations({ project, source, baseline, candidate, timeoutMs: 50 }), /Native TypeScript measurement timed out/i)
  if (process.platform !== "win32") {
    const processes = execFileSync("ps", ["-eo", "comm,args"], { encoding: "utf8" })
    assert.equal(processes.split("\n").filter(line => /^\s*tsc\s/.test(line) && line.includes(".attest-tsgo-")).length, 0)
  }
})

test("measurement rejects project context it cannot reproduce and overrides noCheck", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-measure-"))
  try {
    const config = join(dir, "tsconfig.json")
    const file = join(dir, "main.ts")
    const input = { project: config, source: file, baseline: "type Wrap<T> = { value: T }\n", candidate: "type Wrap<T> = { value: T }\ntype X = Wrap<string>\n" }
    writeFileSync(file, input.baseline)
    writeFileSync(config, JSON.stringify({ compilerOptions: { noCheck: true }, files: ["main.ts"] }))
    assert.ok(measureInstantiations(input).contributed > 0)
    assert.throws(() => measureInstantiations({ ...input, candidate: "const bad: string = 42" }), /Native TypeScript measurement failed.*not assignable/s)
    assert.throws(() => measureInstantiations({ ...input, candidate: 'import "./other.js"' }), /isolated source: imports/)
    writeFileSync(join(dir, "cycle.ts"), 'import "./main.js"\n')
    assert.throws(() => measureInstantiations({ ...input, candidate: 'import "./cycle.js"' }), /isolated source: imports/)
    assert.throws(() => measureInstantiations({ ...input, candidate: 'const x = `${1}`; import "./cycle.js"' }), /isolated source: imports/)
    assert.throws(() => measureInstantiations({ ...input, candidate: '/// <reference path="./cycle.ts" />' }), /isolated source: imports/)
    for (const reexport of [
      'export type { Box } from "./cycle.js"',
      'export * as dep from "./cycle.js"',
      'export /* comment */ { Box } /* comment */ from "./cycle.js"',
      'const x = `${1}`; export type { Box } from "./cycle.js"'
    ]) {
      assert.throws(() => measureInstantiations({ ...input, candidate: reexport }), /isolated source: imports/, reexport)
    }
    assert.throws(() => measureInstantiations({ ...input, candidate: 'export * from "./cycle.js"' }), /isolated source: imports/)
    writeFileSync(join(dir, "globals.d.ts"), "interface BenchmarkContext { value: string }\n")
    writeFileSync(config, JSON.stringify({ files: ["main.ts", "globals.d.ts"] }))
    assert.throws(() => measureInstantiations(input), /isolated single-root project/)
    writeFileSync(config, JSON.stringify({ files: ["globals.d.ts"] }))
    assert.throws(() => measureInstantiations({ ...input, source: join(dir, "globals.d.ts") }), /does not support declaration files/)
    for (const extension of ["d.mts", "d.cts"]) {
      const declaration = join(dir, `other.${extension}`)
      writeFileSync(declaration, "export type Other = string\n")
      writeFileSync(config, JSON.stringify({ files: [`other.${extension}`] }))
      assert.throws(() => measureInstantiations({ ...input, source: declaration }), /does not support declaration files/)
    }
    assert.deepEqual(readdirSync(dir).sort(), ["cycle.ts", "globals.d.ts", "main.ts", "other.d.cts", "other.d.mts", "tsconfig.json"])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
