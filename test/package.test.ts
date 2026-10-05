import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { version } from "typescript"

const root = fileURLToPath(new URL("..", import.meta.url))
const typescript = dirname(fileURLToPath(import.meta.resolve("typescript/package.json")))
const nodeTypes = dirname(fileURLToPath(import.meta.resolve("@types/node/package.json")))

test("packed package works in an isolated TypeScript project", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "attest-tsgo-package-")))
  try {
    const pack: unknown = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      cwd: root, encoding: "utf8"
    }))
    assert.ok(Array.isArray(pack))
    assert.equal(pack.length, 1)
    const entry: unknown = pack[0]
    assert.ok(typeof entry === "object" && entry !== null && "filename" in entry && typeof entry.filename === "string")
    const tarball = join(directory, entry.filename)
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", directory, tarball, typescript, nodeTypes])
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext", strict: true, sourceMap: true, outDir: "build", types: ["node"] },
      files: ["sample.mts"]
    }))
    const source = join(directory, "sample.mts")
    writeFileSync(source, `import { attest, loadCache } from "@texoport/attest"
import { fileURLToPath } from "node:url"

loadCache(fileURLToPath(new URL("../cache.json", import.meta.url)))
const value: number = 42
attest<number>(value).type.toString.snap("number")
attest(value).is(42)
if (process.argv[2] === "fail") attest<string, number>()
`)
    const tsc = join(directory, "node_modules/typescript/bin/tsc")
    execFileSync(process.execPath, [tsc, "--project", join(directory, "tsconfig.json")], { encoding: "utf8" })
    const cli = join(directory, "node_modules/.bin/attest-tsgo")
    const output = join(directory, "cache.json")
    const result = execFileSync(cli, ["precache", "-p", join(directory, "tsconfig.json"), "-o", output], { encoding: "utf8" })
    assert.ok(result.includes(`Cached 3 assertions from TypeScript ${version}`))
    const emitted = join(directory, "build/sample.mjs")
    execFileSync(process.execPath, ["--enable-source-maps", emitted], { cwd: directory, encoding: "utf8" })
    const failure = spawnSync(process.execPath, ["--enable-source-maps", emitted, "fail"], { cwd: directory, encoding: "utf8" })
    assert.notEqual(failure.status, 0)
    assert.match(failure.stderr, /Type mismatch.*number is none to string/)
    writeFileSync(source, readFileSync(source, "utf8") + "\n")
    const stale = spawnSync(process.execPath, ["--enable-source-maps", emitted], { cwd: directory, encoding: "utf8" })
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /Stale or missing attest-tsgo cache/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
