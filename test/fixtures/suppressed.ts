declare function attest(value: unknown): void
attest(() => {
  // @ts-expect-error the type error belongs to this assertion
  const bad: "// @ts-expect-error" = 42
  return bad
})
attest(() => {
  // @ts-ignore the type error belongs to this assertion
  const bad: "// @ts-ignore" = 42
  return bad
})
attest(() => {
  /* @ts-ignore */
  const bad: "/* @ts-ignore */" = 42
  return bad
})
