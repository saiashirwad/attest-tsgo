import { attest } from "../../src/index.ts"

/** The number under test. */
const value: number = 42
const label: string = "ready"
const item = {
  /** The documented property. */
  alpha: 1,
  beta: "two"
}

export function passes(): void {
  attest<number>(value).type.toString.snap("number")
  attest(value).jsdoc.snap("The number under test.")
  attest(value).is(42); attest(label).type.toString.snap("string")
  attest<number, number>()
}

export function failsType(): void {
  attest<string, number>()
}

export function failsSubtype(): void {
  attest<string, "ready">()
}

export function failsSupertype(): void {
  attest<"ready", string>()
}

export function failsAny(): void {
  attest<string, any>()
}

export function failsSnapshot(): void {
  attest(value).type.toString.snap("string")
}

export function checksSuppressedError(): void {
  attest(() => {
    // @ts-expect-error test diagnostic belongs to this call
    const invalid: string = 42
    return invalid
  }).type.errors.snap("Type 'number' is not assignable to type 'string'.")
}

export function checksBoth(expected: string | RegExp = "not assignable"): void {
  attest(() => {
    // @ts-expect-error test both compiler and runtime errors
    const invalid: string = 42
    throw new Error("not assignable")
  }).throwsAndHasTypeError(expected)
}

export function failsMissingRuntimeError(): void {
  attest(() => {
    // @ts-expect-error the compiler error alone must not satisfy the assertion
    const invalid: string = 42
    return invalid
  }).throwsAndHasTypeError("not assignable")
}

export function failsMissingTypeError(): void {
  attest(() => { throw new Error("not assignable") }).throwsAndHasTypeError("not assignable")
}

export function checksEditorData(): void {
  attest(item.alpha).jsdoc.snap("The documented property.")
  // @ts-expect-error precache queries completions before the missing property name
  attest(item.al).type.completions.snap(["alpha", "beta"])
}

export function checksNested(): void {
  attest(attest(value).type.toString.is("number")).type.toString.snap("void")
  const emoji = "💡"; attest(value).type.toString.snap("number")
  void emoji
}
