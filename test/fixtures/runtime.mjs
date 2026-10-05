import { attest } from "../../src/index.ts"

/** @type {number} */
const value = 1

export function succeeds() {
  attest(value).type.toString.snap("number")
  attest(value).type.errors.snap("")
  attest(value).type.toString.is("num")
  attest(() => { throw undefined }).throws()
  attest(value).is(1)
}

export function fails() {
  attest(value).type.toString.snap("string")
}
