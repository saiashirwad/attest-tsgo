import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { version } from "typescript"
import { createScanner, isCallExpression, isIdentifier, isPropertyAccessExpression, SyntaxKind, type CallExpression, type Node, type SourceFile } from "typescript/unstable/ast"
import { API, TypeFlags, type Checker, type Diagnostic, type Project, type Type } from "typescript/unstable/sync"

export type Relationship = "equality" | "subtype" | "supertype" | "none"

export interface AssertionRecord {
  file: string
  start: number
  end: number
  line: number
  column: number
  type: string
  expected?: string
  relationship?: Relationship
  errors: string
  jsdoc: string
  completions: string[]
}

export interface AssertionCache {
  schema: 1
  compiler: string
  config: string
  sources: Record<string, string>
  assertions: AssertionRecord[]
}

function relation(checker: Checker, actual: Type, expected: Type): Relationship {
  if (actual.isErrorType() || expected.isErrorType()) return "none"
  const actualAny = (actual.flags & TypeFlags.Any) !== 0
  const expectedAny = (expected.flags & TypeFlags.Any) !== 0
  if (actualAny) return expectedAny ? "equality" : "supertype"
  if (expectedAny) return "subtype"
  const forward = checker.isTypeAssignableTo(actual, expected)
  const backward = checker.isTypeAssignableTo(expected, actual)
  if (forward && backward) return "equality"
  if (forward) return "subtype"
  if (backward) return "supertype"
  return "none"
}

function diagnosticText(diagnostic: Diagnostic): string {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).map(diagnosticText)].join("\n")
}

function analyzeCall(call: CallExpression, source: SourceFile, project: Project, diagnostics: readonly Diagnostic[]): AssertionRecord {
  const { checker } = project
  const start = call.getStart(source)
  const argument = call.arguments[0]
  const typeArgument = call.typeArguments?.[0]
  const actual = argument
    ? checker.getTypeAtLocation(argument)
    : call.typeArguments?.[1] && checker.getTypeFromTypeNode(call.typeArguments[1])
  if (!actual) throw new Error(`Cannot resolve type at ${source.fileName}:${start}`)
  const expected = typeArgument && checker.getTypeFromTypeNode(typeArgument)
  if (typeArgument && !expected) throw new Error(`Cannot resolve expected type at ${source.fileName}:${start}`)
  const { line, character } = source.getLineAndCharacterOfPosition(start)
  const symbol = argument && checker.getSymbolAtLocation(argument)
  const completions = argument && isPropertyAccessExpression(argument)
    ? checker.getCompletionsAtPosition(source.fileName, argument.name.getStart(source))?.entries.map(e => e.name) ?? []
    : []
  return {
    file: source.fileName,
    start,
    end: call.end,
    line: line + 1,
    column: character + 1,
    type: checker.typeToString(actual),
    ...(expected ? { expected: checker.typeToString(expected), relationship: relation(checker, actual, expected) } : {}),
    errors: diagnostics.filter(d => d.pos >= start && d.end <= call.end).map(diagnosticText).join("\n"),
    jsdoc: symbol ? checker.getDocumentationCommentOfSymbol(symbol) : "",
    completions: [...new Set(completions)].sort()
  }
}

function isAttestCall(node: Node): node is CallExpression {
  return isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === "attest"
}

function analyzeSource(source: SourceFile, project: Project, diagnostics: readonly Diagnostic[]): AssertionRecord[] {
  const assertions: AssertionRecord[] = []
  function visit(node: Node): void {
    if (isAttestCall(node)) assertions.push(analyzeCall(node, source, project, diagnostics))
    node.forEachChild(visit)
  }
  visit(source)
  return assertions
}

function withoutSuppression(source: SourceFile): string | undefined {
  const scanner = createScanner(false, source.languageVariant, source.text)
  const changes: { start: number; end: number; text: string }[] = []
  while (scanner.scan() !== SyntaxKind.EndOfFile) {
    const kind = scanner.getToken()
    if (kind !== SyntaxKind.SingleLineCommentTrivia && kind !== SyntaxKind.MultiLineCommentTrivia) continue
    const start = scanner.getTokenStart()
    const end = scanner.getTokenEnd()
    const comment = source.text.slice(start, end)
    const text = comment.replaceAll("@ts-expect-error", "@ts-expect-erro_").replaceAll("@ts-ignore", "@ts-ign0re")
    if (comment !== text) changes.push({ start, end, text })
  }
  if (!changes.length) return undefined
  let result = source.text
  for (const { start, end, text } of changes.reverse()) result = result.slice(0, start) + text + result.slice(end)
  return result
}

export function analyzeProject(configPath: string): AssertionCache {
  const config = resolve(configPath)
  const api = new API({ cwd: dirname(config) })
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] })
    try {
      const project = snapshot.getProject(config)
      if (!project) throw new Error(`Cannot load TypeScript project ${config}`)
      const assertions: AssertionRecord[] = []
      const sources: Record<string, string> = {}
      const sourceFiles: SourceFile[] = []
      const overlays = new Map<string, string>()
      for (const file of project.rootFiles) {
        const sourceFile = project.program.getSourceFile(file)
        if (!sourceFile) throw new Error(`Cannot load source file ${file}`)
        sources[file] = createHash("sha256").update(sourceFile.text).digest("hex")
        sourceFiles.push(sourceFile)
        const overlay = withoutSuppression(sourceFile)
        if (overlay) overlays.set(file, overlay)
      }
      let diagnosticsProject: Project | undefined
      let diagnosticsSnapshot: ReturnType<API["updateSnapshot"]> | undefined
      let diagnosticsAPI: API | undefined
      try {
        if (overlays.size) {
          diagnosticsAPI = new API({ cwd: dirname(config), fs: { readFile: file => overlays.get(file) } })
          diagnosticsSnapshot = diagnosticsAPI.updateSnapshot({ openProjects: [config] })
          diagnosticsProject = diagnosticsSnapshot.getProject(config)
          if (!diagnosticsProject) throw new Error(`Cannot load diagnostic overlay for ${config}`)
        }
        for (const source of sourceFiles) {
          const diagnostics = (overlays.has(source.fileName) ? diagnosticsProject : project)?.program.getSemanticDiagnostics(source.fileName)
          if (!diagnostics) throw new Error(`Cannot get diagnostics for ${source.fileName}`)
          assertions.push(...analyzeSource(source, project, diagnostics))
        }
      } finally {
        diagnosticsSnapshot?.dispose()
        diagnosticsAPI?.close()
      }
      return { schema: 1, compiler: version, config, sources, assertions }
    } finally {
      snapshot.dispose()
    }
  } finally {
    api.close()
  }
}
