import assert from "node:assert/strict"
import { resolve } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"
import { sourcePath } from "../src/callsite.ts"

test("normalizes POSIX, URL and Windows call-site paths without truncating spaces or parentheses", () => {
  const path = resolve("/tmp/space project/(suite)/sample.ts")
  assert.equal(sourcePath(path), path)
  assert.equal(sourcePath(pathToFileURL(path).href), path)
  assert.equal(sourcePath("C:\\space project\\(suite)\\sample.ts"), "C:\\space project\\(suite)\\sample.ts")
})
