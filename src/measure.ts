import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { rmSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, resolve } from "node:path"
import { version } from "typescript"
import { createScanner, SyntaxKind } from "./compiler/native.ts"
import { compilerCLI, effectiveConfig } from "./compiler/config.ts"

export interface MeasurementInput {
  project: string
  source: string
  baseline: string
  candidate: string
  timeoutMs?: number
}

export interface Measurement {
  baseline: number
  candidate: number
  contributed: number
  algorithm: "native-cli-isolated-v2"
  compiler: string
  configFingerprint: string
}

function assertIsolated(text: string): void {
  if (/<reference\s+(?:path|types)\b/.test(text) || /\bexport\s+(?:\*|\{[^}]*\})\s+from\b/.test(text) ||
      (text.includes("${") && /\b(?:import|require)\b/.test(text))) {
    throw new Error("Native TypeScript measurement requires isolated source: imports and references are not supported")
  }
  const scanner = createScanner(true, 0, text)
  while (scanner.scan() !== SyntaxKind.EndOfFile) {
    if (scanner.getToken() === SyntaxKind.ImportKeyword || scanner.getTokenText() === "require") {
      throw new Error("Native TypeScript measurement requires isolated source: imports and references are not supported")
    }
  }
}

export function measureInstantiations({ project, source, baseline, candidate, timeoutMs = 30_000 }: MeasurementInput): Measurement {
  const file = resolve(source)
  const configPath = resolve(project)
  const { files, fingerprint } = effectiveConfig(configPath)
  if (files.length !== 1 || resolve(files[0]!) !== file) {
    throw new Error("Native TypeScript measurement requires an isolated single-root project (ambient declarations and other roots are unsupported)")
  }
  if (/\.d\.(?:ts|mts|cts)$/.test(file) || !/\.(?:ts|tsx|mts|cts)$/.test(file)) {
    throw new Error("Native TypeScript measurement does not support declaration files or this source extension")
  }
  assertIsolated(baseline)
  assertIsolated(candidate)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Measurement timeoutMs must be positive and finite")
  const synthetic = join(dirname(file), `.attest-tsgo-${randomUUID()}${extname(file)}`)
  const config = `${synthetic}.json`
  function count(text: string): number {
    writeFileSync(synthetic, text)
    const result = spawnSync(process.execPath, [compilerCLI, "--project", config, "--extendedDiagnostics", "--singleThreaded", "--pretty", "false"], {
      cwd: dirname(file), encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs
    })
    if (result.error && "code" in result.error && result.error.code === "ETIMEDOUT") throw new Error(`Native TypeScript measurement timed out after ${timeoutMs}ms`)
    if (result.error || result.status !== 0) {
      throw new Error(`Native TypeScript measurement failed: ${result.error?.message ?? result.stdout + result.stderr}`)
    }
    const match = /^Instantiations:\s*(\d+)\s*$/m.exec(result.stdout)
    if (!match?.[1]) throw new Error("Native TypeScript did not report an Instantiations count")
    return Number(match[1])
  }
  try {
    writeFileSync(config, JSON.stringify({
      extends: configPath,
      files: [basename(synthetic)],
      include: [],
      exclude: [],
      compilerOptions: { composite: false, incremental: false, noEmit: true, noCheck: false }
    }))
    const before = count(baseline)
    const after = count(candidate)
    return { baseline: before, candidate: after, contributed: after - before, algorithm: "native-cli-isolated-v2", compiler: version, configFingerprint: createHash("sha256").update(fingerprint).update("noCheck=false").digest("hex") }
  } finally {
    rmSync(synthetic, { force: true })
    rmSync(config, { force: true })
  }
}
