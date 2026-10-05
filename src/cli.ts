#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { analyzeProject } from "./analyze.ts"

const args = process.argv.slice(2)
if (args[0] !== "precache") {
  throw new Error("Usage: attest-tsgo precache [-p tsconfig.json] [-o .attest/cache.json]")
}
let project = "tsconfig.json"
let output = ".attest/cache.json"
for (let i = 1; i < args.length; i += 2) {
  const value = args[i + 1]
  if (!value) throw new Error(`Missing value for ${args[i]}`)
  if (args[i] === "-p") project = value
  else if (args[i] === "-o") output = value
  else throw new Error(`Unknown or incomplete option: ${args[i]}`)
}
const cache = analyzeProject(project)
const path = resolve(output)
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, JSON.stringify(cache, null, 2) + "\n")
process.stdout.write(`Cached ${cache.assertions.length} assertions from TypeScript ${cache.compiler} at ${path}\n`)
