import { AssertionError } from "node:assert"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { inspect, isDeepStrictEqual } from "node:util"
import { version } from "typescript"
import { callSite } from "./callsite.ts"
import { effectiveConfig } from "./compiler/config.ts"
import type { AssertionCache, AssertionRecord, CompletionQuery, Relationship } from "./analyze.ts"

export { measureInstantiations } from "./measure.ts"

let cache: AssertionCache | undefined
const checkedSources = new Map<string, string>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRelationship(value: unknown): value is Relationship {
  return value === "equality" || value === "subtype" || value === "supertype" || value === "none"
}

function isCompletionQuery(value: unknown): value is CompletionQuery {
  if (!isRecord(value)) return false
  if (value.kind === "not-queried") return true
  if (typeof value.position !== "number") return false
  if (value.kind === "unsupported" || value.kind === "empty") return true
  return value.kind === "results" && Array.isArray(value.entries) && value.entries.every(entry => typeof entry === "string")
}

function isAssertionRecord(value: unknown): value is AssertionRecord {
  if (!isRecord(value)) return false
  const { file, start, end, line, column, type, expected, relationship, errors, diagnostics, jsdoc, completions, completionQueries } = value
  return typeof file === "string" && typeof start === "number" && typeof end === "number" &&
    typeof line === "number" && typeof column === "number" && typeof type === "string" &&
    typeof errors === "string" && typeof jsdoc === "string" &&
    Array.isArray(diagnostics) && diagnostics.every(d => isRecord(d) && typeof d.code === "number" && typeof d.start === "number" && typeof d.end === "number" && typeof d.text === "string") &&
    (completions === null || Array.isArray(completions) && completions.every((entry: unknown) => typeof entry === "string")) &&
    Array.isArray(completionQueries) && completionQueries.every(isCompletionQuery) &&
    (expected === undefined && relationship === undefined || typeof expected === "string" && isRelationship(relationship))
}

function isAssertionCache(value: unknown): value is AssertionCache {
  if (!isRecord(value) || !isRecord(value.sources) || !isRecord(value.options) || !Array.isArray(value.roots) || !Array.isArray(value.assertions)) return false
  const sources = value.sources
  const assertions = value.assertions
  return value.schema === 3 && typeof value.compiler === "string" && typeof value.config === "string" && typeof value.configFingerprint === "string" &&
    sources[value.config] !== undefined && value.roots.every(root => typeof root === "string" && sources[root] !== undefined) &&
    Object.entries(sources).every(([file, hash]) => file.length > 0 && typeof hash === "string") &&
    assertions.every((record: unknown) => isAssertionRecord(record) && sources[record.file] !== undefined)
}

export function loadCache(path: string): void {
  cache = undefined
  checkedSources.clear()
  let data: unknown
  try { data = JSON.parse(readFileSync(path, "utf8")) } catch {
    throw new Error(`Invalid or missing attest-tsgo cache at ${path}; rerun precache`)
  }
  if (!isAssertionCache(data) || data.compiler !== version) {
    throw new Error(`Invalid or incompatible attest-tsgo cache at ${path}; rerun precache`)
  }
  let fingerprint: string
  try { fingerprint = effectiveConfig(data.config).fingerprint } catch {
    throw new Error(`Stale or missing attest-tsgo cache for ${data.config}; rerun precache`)
  }
  if (fingerprint !== data.configFingerprint) throw new Error(`Stale or missing attest-tsgo cache for ${data.config}; rerun precache`)
  for (const [file, hash] of Object.entries(data.sources)) {
    let text: Buffer
    try { text = readFileSync(file) } catch { throw new Error(`Stale or missing attest-tsgo cache for ${file}; rerun precache`) }
    if (createHash("sha256").update(text).digest("hex") !== hash) {
      throw new Error(`Stale or missing attest-tsgo cache for ${file}; rerun precache`)
    }
  }
  cache = data
}

function currentAssertion(): AssertionRecord {
  if (!cache) throw new Error("No attest-tsgo cache loaded; run precache and loadCache(path) first")
  const { file, line, column } = callSite(attest)
  let text = checkedSources.get(file)
  if (text === undefined) {
    text = readFileSync(file, "utf8")
    checkedSources.set(file, text)
  }
  let lineStart = 0
  for (let n = 1; n < line; n++) {
    const newline = text.indexOf("\n", lineStart)
    if (newline < 0) throw new Error(`Invalid source position ${file}:${line}:${column}`)
    lineStart = newline + 1
  }
  const position = lineStart + column - 1
  const record = cache.assertions.find(record => record.file === file && record.start === position)
  if (!record) throw new Error(`No cached attest call at ${file}:${line}:${column}; rerun precache`)
  return record
}

function compare(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    const format = (value: unknown) => typeof value === "string" ? JSON.stringify(value) : inspect(value)
    throw new AssertionError({ actual, expected, operator: "deepStrictEqual", message: `${label}: expected ${format(expected)}, got ${format(actual)}` })
  }
}

function textAssertion(actual: string, label: string) {
  return {
    is(expected: string) {
      if (!actual.includes(expected)) throw new Error(`${label}: expected to contain ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    },
    snap(expected: string) { compare(actual, expected, label) }
  }
}

function matches(message: string, expected: string | RegExp): boolean {
  return typeof expected === "string" ? message.includes(expected) : new RegExp(expected).test(message)
}

export function attest<Expected, Actual>(): ReturnType<typeof assertion>
export function attest<Expected>(value: Expected): ReturnType<typeof assertion>
export function attest<Actual>(value: Actual): ReturnType<typeof assertion>
export function attest(value?: unknown): ReturnType<typeof assertion> {
  const record = currentAssertion()
  if (record.relationship && record.relationship !== "equality") {
    throw new Error(`Type mismatch at ${record.file}:${record.line}: ${record.type} is ${record.relationship} to ${record.expected}`)
  }
  return assertion(value, record)
}

function assertion(value: unknown, record: AssertionRecord) {
  function assertThrows(expected?: string | RegExp): void {
    if (typeof value !== "function") throw new Error("Expected a function for .throws()")
    let didThrow = false
    let thrown: unknown
    try { value() } catch (error) { didThrow = true; thrown = error }
    if (!didThrow) throw new Error("Expected function to throw")
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    if (expected !== undefined && !matches(message, expected)) throw new Error(`Thrown message did not match ${expected}: ${message}`)
  }
  return {
    is(expected: unknown) { compare(value, expected, "Value") },
    snap(expected: unknown) { compare(value, expected, "Value snapshot") },
    throws: assertThrows,
    throwsAndHasTypeError(expected: string | RegExp) {
      assertThrows(expected)
      if (!record.errors || !matches(record.errors, expected)) throw new Error(`Type errors did not match ${expected}: ${record.errors}`)
    },
    type: {
      toString: textAssertion(record.type, "Type"),
      errors: textAssertion(record.errors, "Type errors"),
      completions: {
        snap(expected: string[]) {
          if (record.completions === null) throw new Error("No direct property completions available; inspect .type.completionQueries instead")
          compare(record.completions, expected, "Completions")
        }
      },
      completionQueries: {
        snap(expected: CompletionQuery[]) { compare(record.completionQueries, expected, "Completion queries") }
      }
    },
    jsdoc: textAssertion(record.jsdoc, "JSDoc")
  }
}
