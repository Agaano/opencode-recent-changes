import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { toUnified } from "../src/core/diff/unified.ts"

const FILE = "src/app.ts"

function writeFile(root: string, content: string | Buffer) {
  const target = path.join(root, FILE)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function gitPatch(before: string | Buffer | null, after: string | Buffer | null): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rc-git-"))
  const oldRoot = path.join(directory, "old")
  const newRoot = path.join(directory, "new")
  fs.mkdirSync(oldRoot, { recursive: true })
  fs.mkdirSync(newRoot, { recursive: true })

  if (before !== null) writeFile(oldRoot, before)
  if (after !== null) writeFile(newRoot, after)

  let output = ""
  try {
    output = execFileSync(
      "git",
      ["-C", directory, "-c", "core.autocrlf=false", "diff", "--no-index", "--no-color", "-U3", "--", "old", "new"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
  } catch (error: any) {
    output = String(error?.stdout ?? "")
  }

  fs.rmSync(directory, { recursive: true, force: true })
  return output
    .replace(/a\/old\//g, "a/")
    .replace(/a\/new\//g, "a/")
    .replace(/b\/new\//g, "b/")
    .replace(/b\/old\//g, "b/")
    .trimEnd()
}

function ours(before: string | Buffer, after: string | Buffer, oldExists = true, newExists = true): string {
  const result = toUnified(before.toString(), after.toString(), {
    path: FILE,
    oldExists,
    newExists,
  })
  return result.patch.trimEnd()
}

const cases: Array<{
  name: string
  before: string | Buffer | null
  after: string | Buffer | null
}> = [
  {
    name: "modify with final newline",
    before: "alpha\nbeta\ngamma\n",
    after: "alpha\nBETA\ngamma\n",
  },
  {
    name: "no final newline on both sides",
    before: "alpha\nbeta\ngamma",
    after: "alpha\nBETA\ngamma",
  },
  {
    name: "newline added at eof",
    before: "alpha\nbeta",
    after: "alpha\nbeta\n",
  },
  {
    name: "newline removed at eof",
    before: "alpha\nbeta\n",
    after: "alpha\nbeta",
  },
  {
    name: "crlf lines",
    before: "alpha\r\nbeta\r\ngamma\r\n",
    after: "alpha\r\nBETA\r\ngamma\r\n",
  },
  {
    name: "multi hunk gap six",
    before: "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\n",
    after: "A\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nM\n",
  },
  {
    name: "multi hunk gap seven",
    before: "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\n",
    after: "A\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nN\n",
  },
  {
    name: "add file",
    before: null,
    after: "one\ntwo\n",
  },
  {
    name: "delete file",
    before: "one\ntwo\n",
    after: null,
  },
  {
    name: "empty to content",
    before: "",
    after: "one\ntwo\n",
  },
  {
    name: "content to empty",
    before: "one\ntwo\n",
    after: "",
  },
  {
    name: "unicode",
    before: "привет\nмир\n",
    after: "привет\nМИР\n",
  },
]

for (const fixture of cases) {
  test(`unified matches git: ${fixture.name}`, () => {
    const before = fixture.before
    const after = fixture.after
    const expected = gitPatch(before, after)
    const actual = ours(
      before ?? "",
      after ?? "",
      before !== null,
      after !== null,
    )
    assert.equal(actual, expected)
  })
}

test("binary files are reported without hunks", () => {  const before = Buffer.from([0, 1, 2, 3])
  const after = Buffer.from([0, 4, 5, 6])
  const expected = gitPatch(before, after)
  const actual = toUnified("", "", {
    path: FILE,
    oldExists: true,
    newExists: true,
    binary: true,
    oldSha: "1111111111111111111111111111111111111111",
    newSha: "2222222222222222222222222222222222222222",
  }).patch.trimEnd()

  assert.match(actual, /^diff --git a\/src\/app\.ts b\/src\/app\.ts/)
  assert.match(actual, /Binary files a\/src\/app\.ts and b\/src\/app\.ts differ/)
  assert.doesNotMatch(actual, /^@@/m)
  assert.match(expected, /Binary files/)
})

test("a 10k-line file with one edit stays fast", () => {
  const lines = Array.from({ length: 10_000 }, (_, index) => `line ${index}`)
  const before = `${lines.join("\n")}\n`
  const after = `${lines.map((line, index) => (index === 5_000 ? "LINE 5000" : line)).join("\n")}\n`

  const started = performance.now()
  const result = toUnified(before, after, { path: FILE })
  const elapsed = performance.now() - started

  assert.equal(result.additions, 1)
  assert.equal(result.deletions, 1)
  assert.ok(elapsed < 500, `diff took ${elapsed.toFixed(1)}ms`)
})
