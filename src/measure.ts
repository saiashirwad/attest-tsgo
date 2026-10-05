import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { rmSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface MeasurementInput {
  project: string
  source: string
  baseline: string
  candidate: string
}

export interface Measurement {
  baseline: number
  candidate: number
  contributed: number
  algorithm: "native-cli-noemit-single-threaded-v1"
}

const compiler = join(dirname(fileURLToPath(import.meta.resolve("typescript/package.json"))), "bin/tsc")

export function measureInstantiations({ project, source, baseline, candidate }: MeasurementInput): Measurement {
  const file = resolve(source)
  const synthetic = join(dirname(file), `.attest-tsgo-${randomUUID()}${extname(file)}`)
  const config = `${synthetic}.json`
  writeFileSync(config, JSON.stringify({
    extends: resolve(project),
    files: [basename(synthetic)],
    include: [],
    exclude: [],
    compilerOptions: { composite: false, incremental: false, noEmit: true }
  }))
  function count(text: string): number {
    writeFileSync(synthetic, text)
    const result = spawnSync(process.execPath, [compiler, "--project", config, "--extendedDiagnostics", "--singleThreaded", "--pretty", "false"], {
      cwd: dirname(file), encoding: "utf8", maxBuffer: 8 * 1024 * 1024
    })
    if (result.error || result.status !== 0) {
      throw new Error(`Native TypeScript measurement failed: ${result.error?.message ?? result.stdout + result.stderr}`)
    }
    const match = /^Instantiations:\s*(\d+)\s*$/m.exec(result.stdout)
    if (!match?.[1]) throw new Error("Native TypeScript did not report an Instantiations count")
    return Number(match[1])
  }
  try {
    const before = count(baseline)
    const after = count(candidate)
    return { baseline: before, candidate: after, contributed: after - before, algorithm: "native-cli-noemit-single-threaded-v1" }
  } finally {
    rmSync(synthetic, { force: true })
    rmSync(config, { force: true })
  }
}
