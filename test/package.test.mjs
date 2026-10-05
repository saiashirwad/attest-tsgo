import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const root = fileURLToPath(new URL("..", import.meta.url))
const typescript = dirname(fileURLToPath(import.meta.resolve("typescript/package.json")))
const nodeTypes = dirname(fileURLToPath(import.meta.resolve("@types/node/package.json")))
const npm = (args, options) => process.env.npm_execpath
  ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], options)
  : execFileSync("npm", args, options)

test("packed package resolves source maps in a project with spaces and parentheses", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "attest package (mapped)-")))
  try {
    const pack = JSON.parse(npm(["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      cwd: root, encoding: "utf8"
    }))
    assert.ok(pack[0].files.some(file => file.path === "dist/index.d.ts"))
    assert.ok(pack[0].files.some(file => file.path === "dist/cli.js"))
    assert.ok(pack[0].files.some(file => file.path === "LICENSE"))
    const tarball = join(directory, pack[0].filename)
    npm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", directory, tarball, typescript, nodeTypes])
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
const emoji = "💡"; attest(value).is(42); attest(value).type.toString.snap("number")
attest(attest(value).type.toString.is("number")).type.toString.snap("void")
void emoji
if (process.argv[2] === "fail") attest<string, number>()
`.replaceAll("\n", "\r\n"))
    const tsc = join(directory, "node_modules/typescript/bin/tsc")
    execFileSync(process.execPath, [tsc, "--project", join(directory, "tsconfig.json")], { encoding: "utf8" })
    const cli = join(directory, "node_modules/@texoport/attest/dist/cli.js")
    assert.match(readFileSync(cli, "utf8"), /^#!\/usr\/bin\/env node/)
    assert.ok(existsSync(join(directory, "node_modules/.bin", process.platform === "win32" ? "attest-tsgo.cmd" : "attest-tsgo")))
    if (process.platform !== "win32") assert.ok(statSync(cli).mode & 0o111)
    const output = join(directory, "cache.json")
    const result = execFileSync(process.execPath, [cli, "precache", "-p", join(directory, "tsconfig.json"), "-o", output], { encoding: "utf8" })
    assert.match(result, /Cached 7 assertions from TypeScript 7\.0\.2/)
    const cache = JSON.parse(readFileSync(output, "utf8"))
    assert.equal(cache.assertions.length, 7)
    for (const record of cache.assertions) {
      assert.ok(Object.hasOwn(cache.sources, record.file), `Missing manifest entry for ${record.file}`)
    }
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
