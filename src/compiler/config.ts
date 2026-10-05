import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`
let executable: string
try {
  const typescriptPackage = realpathSync(fileURLToPath(import.meta.resolve("typescript/package.json")))
  const nativePackage = createRequire(typescriptPackage).resolve(`${platformPackage}/package.json`)
  executable = join(dirname(nativePackage), "lib", process.platform === "win32" ? "tsc.exe" : "tsc")
} catch (error) {
  throw new Error(`Native TypeScript compiler unavailable: cannot resolve ${platformPackage}`, { cause: error })
}
if (!existsSync(executable)) throw new Error(`Native TypeScript compiler executable missing: ${executable}`)
export const compilerExecutable = process.platform === "win32" && executable.length >= 248 ? `\\\\?\\${executable}` : executable

export function validateConfig(config: string): void {
  const result = spawnSync(compilerExecutable, ["--project", config, "--noCheck", "--noEmit", "--pretty", "false"], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Cannot analyze TypeScript project ${config}: ${result.error?.message ?? result.stderr + result.stdout}`)
  }
}

export function effectiveConfig(config: string): { fingerprint: string; files: string[] } {
  const result = spawnSync(compilerExecutable, ["--showConfig", "--project", config], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Cannot load TypeScript project ${config}: ${result.error?.message ?? result.stderr + result.stdout}`)
  }
  const parsed: unknown = JSON.parse(result.stdout)
  if (typeof parsed !== "object" || parsed === null || !("files" in parsed) || !Array.isArray(parsed.files) ||
      !parsed.files.every(file => typeof file === "string")) throw new Error(`Invalid TypeScript configuration at ${config}`)
  return {
    fingerprint: createHash("sha256").update(result.stdout).digest("hex"),
    files: parsed.files.map(file => join(dirname(config), file))
  }
}
