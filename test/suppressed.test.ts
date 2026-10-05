import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { analyzeProject } from "../src/analyze.ts"

const config = fileURLToPath(new URL("./fixtures/suppressed.tsconfig.json", import.meta.url))
const file = fileURLToPath(new URL("./fixtures/suppressed.ts", import.meta.url))
const source = readFileSync(file, "utf8")
const cache = analyzeProject(config)

for (const { comment, literal } of [
  { comment: "// @ts-expect-error the type error belongs to this assertion", literal: "// @ts-expect-error" },
  { comment: "// @ts-ignore the type error belongs to this assertion", literal: "// @ts-ignore" },
  { comment: "/* @ts-ignore */", literal: "/* @ts-ignore */" }
]) {
  test(`recovers ${literal} diagnostics while preserving string literals and positions`, () => {
    const start = source.indexOf(`attest(() => {\n  ${comment}`)
    assert.notEqual(start, -1)
    const record = cache.assertions.find(record => record.start === start)
    assert.ok(record)
    assert.equal(record.errors, `Type '42' is not assignable to type '"${literal}"'.`)
    assert.equal(record.file, file)
    assert.equal(record.column, 1)
    assert.equal(record.line, source.slice(0, start).split("\n").length)
    assert.equal(record.end, source.indexOf("})", start) + 2)
  })
}

test("retains the original source hash and leaves the analyzed file untouched", () => {
  assert.equal(cache.sources[file], createHash("sha256").update(source).digest("hex"))
  assert.equal(readFileSync(file, "utf8"), source)
})
