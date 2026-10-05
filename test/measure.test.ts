import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, test } from "node:test"
import { measureInstantiations } from "../src/index.ts"

const project = fileURLToPath(new URL("./fixtures/measure.tsconfig.json", import.meta.url))
const baseline = readFileSync(new URL("./fixtures/measure.ts", import.meta.url), "utf8")
const candidate = baseline + 'const result: Wrap<string> = { value: "hello" }\n'
let directory: string
let source: string

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "attest-tsgo-measure-")))
  source = join(directory, "measure.ts")
  writeFileSync(source, baseline)
})

afterEach(() => {
  try {
    assert.deepEqual(readdirSync(directory), ["measure.ts"])
    assert.equal(readFileSync(source, "utf8"), baseline)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("adding a generic instantiation produces a repeatable positive contribution", () => {
  const input = { project, source, baseline, candidate }
  const first = measureInstantiations(input)
  const second = measureInstantiations(input)
  assert.equal(first.algorithm, "native-cli-noemit-single-threaded-v1")
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
