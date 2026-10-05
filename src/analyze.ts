import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { effectiveConfig, validateConfig } from "./compiler/config.ts"
import { API, TypeFlags, getLeadingCommentRanges, getTrailingCommentRanges, isCallExpression, isIdentifier, isNoSubstitutionTemplateLiteral, isPropertyAccessExpression, isStringLiteral, isTemplateExpression, isTemplateHead, isTemplateMiddle, isTemplateTail, version, requireNativeCapabilities, type CallExpression, type Node, type SourceFile, type Checker, type CompilerOptions, type Diagnostic, type Project, type Type } from "./compiler/native.ts"

export type Relationship = "equality" | "subtype" | "supertype" | "none"
export type CompletionQuery = { kind: "not-queried" } | { kind: "unsupported" | "empty"; position: number } | { kind: "results"; position: number; entries: string[] }

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
  diagnostics: { code: number; start: number; end: number; text: string }[]
  jsdoc: string
  completions: string[] | null
  completionQueries: CompletionQuery[]
}

export interface AssertionCache {
  schema: 3
  compiler: string
  config: string
  configFingerprint: string
  options: CompilerOptions
  roots: string[]
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
  const completionQueries: CompletionQuery[] = []
  function visit(node: Node): void {
    let position: number | undefined
    if (isPropertyAccessExpression(node)) position = node.name.getStart(source)
    else if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      if (checker.getContextualType(node)) position = node.getStart(source) + 1
    } else if ((isTemplateHead(node) || isTemplateMiddle(node) || isTemplateTail(node)) && isTemplateExpression(node.parent)) {
      if (checker.getContextualType(node.parent)) position = node.getStart(source) + 1
    }
    if (position !== undefined) {
      let info: ReturnType<Checker["getCompletionsAtPosition"]>
      try { info = checker.getCompletionsAtPosition(source.fileName, position) } catch (error) {
        throw new Error(`Native TypeScript completion query failed at ${source.fileName}:${position}`, { cause: error })
      }
      const entries = [...new Set(info?.entries.map(entry => entry.name) ?? [])].sort()
      completionQueries.push(info === undefined ? { kind: "unsupported", position } :
        entries.length ? { kind: "results", position, entries } : { kind: "empty", position })
    }
    node.forEachChild(visit)
  }
  for (const value of call.arguments) visit(value)
  if (!completionQueries.length) completionQueries.push({ kind: "not-queried" })
  const direct = argument && isPropertyAccessExpression(argument)
    ? completionQueries.find(query => "position" in query && query.position === argument.name.getStart(source))
    : undefined
  const completions = direct?.kind === "results" ? direct.entries : direct?.kind === "empty" ? [] : null
  return {
    file: source.fileName,
    start,
    end: call.end,
    line: line + 1,
    column: character + 1,
    type: checker.typeToString(actual),
    ...(expected ? { expected: checker.typeToString(expected), relationship: relation(checker, actual, expected) } : {}),
    errors: diagnostics.filter(d => d.pos >= start && d.end <= call.end).map(diagnosticText).join("\n"),
    diagnostics: diagnostics.filter(d => d.pos >= start && d.end <= call.end).map(d => ({ code: d.code, start: d.pos, end: d.end, text: diagnosticText(d) })),
    jsdoc: symbol ? checker.getDocumentationCommentOfSymbol(symbol) : "",
    completions,
    completionQueries
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
  const changes = new Map<number, { end: number; text: string }>()
  function visit(node: Node): void {
    const comments = [
      ...getLeadingCommentRanges(source.text, node.pos) ?? [],
      ...getTrailingCommentRanges(source.text, node.end) ?? []
    ]
    for (const { pos: start, end } of comments) {
      const comment = source.text.slice(start, end)
      const text = comment.replaceAll("@ts-expect-error", "@ts-expect-erro_").replaceAll("@ts-ignore", "@ts-ign0re").replaceAll("@ts-nocheck", "@ts-nochec_")
      if (comment !== text) changes.set(start, { end, text })
    }
    node.forEachChild(visit)
  }
  visit(source)
  if (!changes.size) return undefined
  let result = source.text
  for (const [start, { end, text }] of [...changes].sort((a, b) => b[0] - a[0])) result = result.slice(0, start) + text + result.slice(end)
  return result
}

export function analyzeProject(configPath: string, { allowEmpty = false }: { allowEmpty?: boolean } = {}): AssertionCache {
  const config = resolve(configPath)
  const { fingerprint } = effectiveConfig(config)
  validateConfig(config)
  const api = new API({ cwd: dirname(config) })
  try {
    api.parseConfigFile(config)
    let snapshot: ReturnType<API["updateSnapshot"]>
    try { snapshot = api.updateSnapshot({ openProjects: [config] }) } catch (error) {
      throw new Error(`Cannot load TypeScript project ${config}`, { cause: error })
    }
    try {
      const project = snapshot.getProject(config)
      if (!project) throw new Error(`Cannot load TypeScript project ${config}`)
      requireNativeCapabilities(project)
      if (project.compilerOptions.noCheck) throw new Error(`Cannot analyze ${config} with noCheck enabled; type diagnostics are required`)
      const syntaxErrors = project.program.getSyntacticDiagnostics()
      if (syntaxErrors.length) throw new Error(`Cannot analyze ${config}: ${syntaxErrors.map(diagnosticText).join("; ")}`)
      const assertions: AssertionRecord[] = []
      const sources: Record<string, string> = {}
      const sourceFiles: SourceFile[] = []
      const overlays = new Map<string, string>()
      for (const file of [config, ...project.program.getSourceFileNames()]) {
        const path = resolve(file)
        sources[path] = createHash("sha256").update(readFileSync(path)).digest("hex")
      }
      for (const file of project.rootFiles) {
        const sourceFile = project.program.getSourceFile(file)
        if (!sourceFile) throw new Error(`Cannot load source file ${file}`)
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
      if (!allowEmpty && assertions.length === 0) throw new Error(`No attest(...) assertions found in project roots of ${config}; use --allow-empty to permit this`)
      return { schema: 3, compiler: version, config, configFingerprint: fingerprint, options: project.compilerOptions, roots: [...project.rootFiles].map(file => resolve(file)), sources, assertions }
    } finally {
      snapshot.dispose()
    }
  } finally {
    api.close()
  }
}
