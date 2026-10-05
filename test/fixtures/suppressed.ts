declare function attest(value: unknown): void
const literal = "// @ts-expect-error"
attest(() => {
  // @ts-expect-error the type error belongs to this assertion
  const bad: string = 42
  return bad
})
void literal
