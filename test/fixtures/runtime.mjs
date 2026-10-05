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

/** @param {unknown} value */
export function assertionFor(value) {
  return attest(value)
}

export function comparisons() {
  attest(1n).is(1n)
  attest(new Map([["x", 1]])).is(new Map([["x", 1]]))
  attest(new Set([1, 2])).is(new Set([2, 1]))
  attest(new Uint8Array([1, 2])).is(new Uint8Array([1, 2]))
  const a = { value: 1 }; a.self = a
  const b = { value: 2 }; b.self = b
  return {
    bigint: () => attest(1n).is(2n),
    circular: () => attest(a).is(b),
    map: () => attest(new Map([["x", 1]])).is(new Map([["x", 2]])),
    set: () => attest(new Set([1])).is(new Set([2])),
    symbol: () => attest(Symbol.for("x")).is(Symbol.for("y")),
    function: () => attest(() => 1).is(() => 2),
    typedArray: () => attest(new Uint8Array([1])).is(new Uint8Array([2]))
  }
}
