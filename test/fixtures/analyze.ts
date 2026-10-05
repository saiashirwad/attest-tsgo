declare function attest<Expected, Actual>(): void
declare function attest<Expected>(actual: Expected): void
declare function attest(actual: unknown): void

/** A documented input. */
const input: number = 1
const item = { alpha: 1, beta: "two" }
const outside: string = 42
attest<number>(input)
attest<string>(input)
attest(item.al)
attest(input)
attest<string, number>()
attest<number, 1>()
attest<1, number>()
attest<any, any>()
attest<string, any>()
attest<any, string>()
attest<unknown, string>()
attest<string, unknown>()
attest<string, never>()
attest<never, string>()
attest<string, MissingActual>()
attest<MissingExpected, string>()
