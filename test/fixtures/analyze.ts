declare function attest<Expected, Actual>(): void
declare function attest<Expected>(actual: Expected): void
declare function attest(actual: unknown): void

/** A documented input. */
const input: number = 1
const item = { alpha: 1, beta: "two" }
attest<number>(input)
attest<string>(input)
attest(item.al)
attest(input)
attest<string, number>()
