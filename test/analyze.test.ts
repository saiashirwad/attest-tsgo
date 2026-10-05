import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

test("invalid configuration, missing projects, noCheck and empty projects fail explicitly", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-analysis-"))
  try {
    const project = join(dir, "tsconfig.json")
    assert.throws(() => analyzeProject(project), /Cannot load TypeScript project/)
    writeFileSync(join(dir, "sample.ts"), "export const value = 1\n")
    const configFor = (options: object) => writeFileSync(project, JSON.stringify({ compilerOptions: options, files: ["sample.ts"] }))
    configFor({ unknownCompilerOption: true })
    assert.throws(() => analyzeProject(project), /Unknown compiler option/)
    configFor({ noCheck: true })
    assert.throws(() => analyzeProject(project), /noCheck enabled/)
    configFor({ strict: true })
    assert.throws(() => analyzeProject(project), /No attest\(\.\.\.\) assertions found/)
    assert.equal(analyzeProject(project, { allowEmpty: true }).assertions.length, 0)
    writeFileSync(join(dir, "sample.ts"), "declare function attest(value: unknown): void\nattest(() => { const x: string = 1; return x })\n")
    const result = analyzeProject(project)
    assert.deepEqual(result.assertions[0].diagnostics.map(d => d.code), [2322])
    writeFileSync(join(dir, "sample.ts"), "attest(() => { const x = ; })\n")
    assert.throws(() => analyzeProject(project), /Cannot analyze.*Expression expected/s)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("relations cover unions, aliases and recursive types", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-types-"))
  try {
    const project = join(dir, "tsconfig.json")
    writeFileSync(project, JSON.stringify({ compilerOptions: { strict: true }, files: ["types.ts"] }))
    writeFileSync(join(dir, "types.ts"), [
      "declare function attest<E, A>(): void",
      "type Box<T> = { value: T }",
      "type Recursive = { next?: Recursive }",
      "attest<number, number>()",
      "attest<number | string, number>()",
      "attest<number, number | string>()",
      "attest<string, number>()",
      "attest<unknown, any>()",
      "attest<any, unknown>()",
      "attest<never, never>()",
      "attest<Box<string>, Box<string>>()",
      "attest<MissingType, string>()",
      "attest<Recursive, Recursive>()"
    ].join("\n"))
    const records = analyzeProject(project).assertions
    assert.deepEqual(records.map(r => r.relationship), ["equality", "subtype", "supertype", "none", "supertype", "subtype", "equality", "equality", "none", "equality"])
    assert.match(records[8].type, /string/)
    assert.ok(records[9].type.length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("records distinct string and template completion positions and unqueried calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-completions-"))
  try {
    const project = join(dir, "tsconfig.json")
    const code = 'declare function attest<T>(...value: T[]): void\ntype Choice = "alpha" | "beta"\nattest<Choice>("a", `b`)\nattest(42)\nattest<string>("x")\n'
    writeFileSync(project, JSON.stringify({ files: ["types.ts"] }))
    writeFileSync(join(dir, "types.ts"), code)
    const [strings, number, unsupported] = analyzeProject(project).assertions
    assert.deepEqual(strings.completionQueries, [
      { kind: "results", position: code.indexOf('"a"') + 1, entries: ["alpha", "beta"] },
      { kind: "results", position: code.indexOf('`b`') + 1, entries: ["alpha", "beta"] }
    ])
    assert.deepEqual(number.completionQueries, [{ kind: "not-queried" }])
    assert.deepEqual(unsupported.completionQueries, [{ kind: "unsupported", position: code.lastIndexOf('"x"') + 1 }])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
