import { findSourceMap } from "node:module"
import { resolve, win32 } from "node:path"
import { fileURLToPath } from "node:url"

export function sourcePath(location: string): string {
  if (location.startsWith("file:")) return resolve(fileURLToPath(location))
  return /^[A-Za-z]:[\\/]/.test(location) || location.startsWith("\\\\") ? win32.normalize(location) : resolve(location)
}

export function callSite(boundary: Function): { file: string; line: number; column: number } {
  const previous = Error.prepareStackTrace
  try {
    Error.prepareStackTrace = (_error, frames) => frames
    const error = new Error()
    Error.captureStackTrace(error, boundary)
    const frames = error.stack as unknown as NodeJS.CallSite[]
    const frame = frames[0]
    const location = frame?.getFileName()
    const line = frame?.getLineNumber()
    const column = frame?.getColumnNumber()
    if (!location || !line || !column) throw new Error("Cannot locate attest call in stack")
    const file = sourcePath(location)
    const mapped = findSourceMap(file)?.findEntry(line - 1, column - 1)
    return mapped && "originalSource" in mapped && mapped.originalSource
      ? { file: sourcePath(mapped.originalSource), line: mapped.originalLine + 1, column: mapped.originalColumn + 1 }
      : { file, line, column }
  } finally {
    Error.prepareStackTrace = previous
  }
}
