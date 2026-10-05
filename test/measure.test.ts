import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { measureInstantiations } from "../src/index.ts"

const source = fileURLToPath(new URL("./fixtures/measure.ts", import.meta.url))
const project = fileURLToPath(new URL("./fixtures/measure.tsconfig.json", import.meta.url))
const baseline = readFileSync(source, "utf8")

test("isolated CLI measurements produce a repeatable nonzero delta and clean up", () => {
  const input = { project, source, baseline, candidate: baseline + 'const result: Wrap<string> = { value: "hello" }\n' }
  const before = readdirSync(dirname(source))
  const first = measureInstantiations(input)
  const second = measureInstantiations(input)
  assert.equal(first.algorithm, "native-cli-noemit-single-threaded-v1")
  assert.ok(first.contributed > 0)
  assert.equal(first.contributed, first.candidate - first.baseline)
  assert.deepEqual(second, first)
  assert.throws(() => measureInstantiations({ ...input, candidate: baseline + "const invalid: string = 42\n" }), /Native TypeScript measurement failed.*not assignable/s)
  assert.deepEqual(readdirSync(dirname(source)), before)
})
