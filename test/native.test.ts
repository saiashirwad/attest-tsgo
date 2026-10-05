import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { API } from "typescript/unstable/sync"

const file = fileURLToPath(new URL("./fixtures/basic.ts", import.meta.url))
const config = fileURLToPath(new URL("./fixtures/tsconfig.json", import.meta.url))

test("published TypeScript 7 checker exposes the operations attest needs", () => {
  const code = readFileSync(file, "utf8")
  const api = new API()
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config], openFiles: [file] })
    try {
      const project = snapshot.getDefaultProjectForFile(file)
      assert.ok(project)
      const { checker, program } = project
      const left = checker.getTypeAtPosition(file, code.lastIndexOf("greeting\n"))
      const right = checker.getTypeAtPosition(file, code.lastIndexOf("count\n"))
      assert.ok(left && right)
      assert.equal(checker.typeToString(left), "string")
      assert.equal(checker.typeToString(right), "number")
      assert.equal(checker.isTypeAssignableTo(left, right), false)
      assert.equal(checker.isTypeAssignableTo(right, left), false)
      assert.deepEqual(program.getSemanticDiagnostics(file).map(d => d.code), [2322])
      const entries = checker.getCompletionsAtPosition(file, code.indexOf("item.alpha") + 5)?.entries
      assert.deepEqual(entries?.map(e => e.name).filter(n => n === "alpha" || n === "beta").sort(), ["alpha", "beta"])
      const symbol = checker.getSymbolAtPosition(file, code.lastIndexOf("greeting\n"))
      assert.ok(symbol)
      assert.equal(checker.getDocumentationCommentOfSymbol(symbol), "A documented value.")
    } finally {
      snapshot.dispose()
    }
  } finally {
    api.close()
  }
})
