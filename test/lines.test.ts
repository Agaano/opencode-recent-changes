import assert from "node:assert/strict"
import test from "node:test"
import { diffLines, lineStats, splitLines } from "../src/core/diff/lines.ts"

function apply(before: string[], ops: ReturnType<typeof diffLines>["ops"]): string[] {
  const result: string[] = []
  for (const op of ops) {
    if (op.type === "equal" || op.type === "insert") result.push(op.text)
  }
  return result
}

test("splitLines keeps content and drops the trailing empty line", () => {
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"])
  assert.deepEqual(splitLines("a\r\nb"), ["a", "b"])
  assert.deepEqual(splitLines(""), [])
})

test("equal sequences produce only equal ops", () => {
  const { ops } = diffLines(["a", "b"], ["a", "b"])
  assert.equal(ops.length, 2)
  assert.ok(ops.every((op) => op.type === "equal"))
})

test("insert and delete are counted", () => {
  assert.deepEqual(lineStats("a\n", "a\nb\n"), {
    additions: 1,
    deletions: 0,
    binary: false,
    truncated: false,
  })
  assert.deepEqual(lineStats("a\nb\n", "a\n"), {
    additions: 0,
    deletions: 1,
    binary: false,
    truncated: false,
  })
})

test("replace keeps the unchanged lines", () => {
  const { ops } = diffLines(["a", "b", "c"], ["a", "x", "c"])
  assert.deepEqual(apply(["a", "b", "c"], ops), ["a", "x", "c"])
  assert.equal(ops.filter((op) => op.type === "insert").length, 1)
  assert.equal(ops.filter((op) => op.type === "delete").length, 1)
})

test("random-ish edits reconstruct the target", () => {
  const before = ["one", "two", "three", "four", "five", "six"]
  const after = ["zero", "one", "three", "four", "five", "seven", "eight"]
  const { ops } = diffLines(before, after)
  assert.deepEqual(apply(before, ops), after)
})

test("binary input has no line stats", () => {
  assert.deepEqual(lineStats("a\0b", "c"), {
    additions: 0,
    deletions: 0,
    binary: true,
    truncated: false,
  })
})
