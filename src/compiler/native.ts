import { version } from "typescript"
import { createScanner, getLeadingCommentRanges, getTrailingCommentRanges, isCallExpression, isIdentifier, isNoSubstitutionTemplateLiteral, isPropertyAccessExpression, isStringLiteral, isTemplateExpression, isTemplateHead, isTemplateMiddle, isTemplateTail, SyntaxKind } from "typescript/unstable/ast"
import { API, TypeFlags } from "typescript/unstable/sync"

export { version, createScanner, getLeadingCommentRanges, getTrailingCommentRanges, isCallExpression, isIdentifier, isNoSubstitutionTemplateLiteral, isPropertyAccessExpression, isStringLiteral, isTemplateExpression, isTemplateHead, isTemplateMiddle, isTemplateTail, SyntaxKind, API, TypeFlags }
export type { CallExpression, Node, SourceFile } from "typescript/unstable/ast"
export type { Checker, CompilerOptions, Diagnostic, Project, Type } from "typescript/unstable/sync"

export function requireNativeCapabilities(project: import("typescript/unstable/sync").Project): void {
  const { checker, program } = project
  if (typeof program.getSourceFileNames !== "function" ||
      typeof program.getSourceFile !== "function" ||
      typeof program.getSemanticDiagnostics !== "function" ||
      typeof program.getSyntacticDiagnostics !== "function" ||
      typeof checker.getTypeAtLocation !== "function" ||
      typeof checker.getTypeFromTypeNode !== "function" ||
      typeof checker.getContextualType !== "function" ||
      typeof checker.typeToString !== "function" ||
      typeof checker.isTypeAssignableTo !== "function" ||
      typeof checker.getDocumentationCommentOfSymbol !== "function" ||
      typeof checker.getCompletionsAtPosition !== "function") {
    throw new Error(`TypeScript ${version} is missing required native compiler capabilities; use the supported compiler version`)
  }
}
