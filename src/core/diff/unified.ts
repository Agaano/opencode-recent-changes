import { diffLines, isBinary, type DiffOp } from "./lines.ts"
import { gitBlobSha1, gitPath, modeString } from "./format.ts"

const NO_EOL = "\u0000"

interface RawLines {
  lines: string[]
  finalNewline: boolean
}

function splitRaw(text: string): RawLines {
  if (text === "") return { lines: [], finalNewline: false }

  const finalNewline = text.endsWith("\n")
  const body = finalNewline ? text.slice(0, -1) : text
  const lines = body.split("\n")
  if (!finalNewline && lines.length > 0) {
    lines[lines.length - 1] += NO_EOL
  }
  return { lines, finalNewline }
}

function render(text: string): string {
  return text.endsWith(NO_EOL) ? text.slice(0, -NO_EOL.length) : text
}

function range(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`
}

/**
 * Git's xdl_find_func heuristic: scan back from the hunk start for a line
 * that begins with a letter, `_`, or `$`, stopping at a blank line.
 */
function functionContext(lines: string[], oldStart: number): string | undefined {
  if (oldStart <= 1) return undefined

  for (let index = oldStart - 2; index >= 0; index--) {
    const text = render(lines[index]).replace(/\r$/, "")
    if (text.trim() === "") break
    const first = text[0]
    if (first && /[A-Za-z_$]/.test(first)) return text.slice(0, 80).trimEnd()
  }

  return undefined
}

interface Row {
  type: DiffOp["type"]
  oldLine?: number
  newLine?: number
  text: string
}

export interface UnifiedOptions {
  path: string
  oldMode?: number
  newMode?: number
  oldExists?: boolean
  newExists?: boolean
  context?: number
  maxD?: number
  binary?: boolean
  oldSha?: string
  newSha?: string
}

export interface UnifiedResult {
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
  binary: boolean
  truncated: boolean
}

export function toUnified(
  before: string,
  after: string,
  options: UnifiedOptions,
): UnifiedResult {
  const oldExists = options.oldExists !== false
  const newExists = options.newExists !== false
  const context = options.context ?? 3
  const status: UnifiedResult["status"] = !oldExists
    ? "added"
    : !newExists
      ? "deleted"
      : "modified"

  const binary = options.binary ?? (isBinary(before) || isBinary(after))
  const oldHash = oldExists ? (options.oldSha ?? gitBlobSha1(before)) : undefined
  const newHash = newExists ? (options.newSha ?? gitBlobSha1(after)) : undefined
  const oldShort = oldHash ? oldHash.slice(0, 7) : "0000000"
  const newShort = newHash ? newHash.slice(0, 7) : "0000000"
  const mode = modeString(status === "deleted" ? options.oldMode : options.newMode)

  const header: string[] = [
    `diff --git ${gitPath("a", options.path)} ${gitPath("b", options.path)}`,
  ]

  if (status === "added") header.push(`new file mode ${mode}`)
  else if (status === "deleted") header.push(`deleted file mode ${mode}`)

  if (binary) {
    if (status === "added") header.push(`index 0000000..${newShort}`)
    else if (status === "deleted") header.push(`index ${oldShort}..0000000`)
    else header.push(`index ${oldShort}..${newShort} ${mode}`)

    header.push(
      `Binary files ${status === "added" ? "/dev/null" : gitPath("a", options.path)} and ${
        status === "deleted" ? "/dev/null" : gitPath("b", options.path)
      } differ`,
    )

    return {
      patch: `${header.join("\n")}\n`,
      additions: 0,
      deletions: 0,
      status,
      binary: true,
      truncated: false,
    }
  }

  if (status === "added") {
    header.push(`index 0000000..${newShort}`, "--- /dev/null", `+++ ${gitPath("b", options.path)}`)
  } else if (status === "deleted") {
    header.push(`index ${oldShort}..0000000`, `--- ${gitPath("a", options.path)}`, "+++ /dev/null")
  } else {
    header.push(
      `index ${oldShort}..${newShort} ${mode}`,
      `--- ${gitPath("a", options.path)}`,
      `+++ ${gitPath("b", options.path)}`,
    )
  }

  const oldSplit = splitRaw(before)
  const newSplit = splitRaw(after)
  const result = diffLines(oldSplit.lines, newSplit.lines, options.maxD)

  const rows: Row[] = result.ops.map((op) => ({
    type: op.type,
    oldLine: op.a,
    newLine: op.b,
    text: op.text,
  }))

  const changes: number[] = []
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].type !== "equal") changes.push(index)
  }

  if (changes.length === 0) {
    return {
      patch: `${header.join("\n")}\n`,
      additions: 0,
      deletions: 0,
      status,
      binary: false,
      truncated: result.truncated,
    }
  }

  const oldBefore: number[] = new Array(rows.length + 1).fill(0)
  const newBefore: number[] = new Array(rows.length + 1).fill(0)
  for (let index = 0; index < rows.length; index++) {
    oldBefore[index + 1] = oldBefore[index] + (rows[index].oldLine !== undefined ? 1 : 0)
    newBefore[index + 1] = newBefore[index] + (rows[index].newLine !== undefined ? 1 : 0)
  }

  const groups: Array<[number, number]> = []
  let start = Math.max(0, changes[0] - context)
  let end = Math.min(rows.length, changes[0] + context + 1)

  for (const change of changes.slice(1)) {
    const nextStart = Math.max(0, change - context)
    const nextEnd = Math.min(rows.length, change + context + 1)
    if (nextStart <= end) {
      end = Math.max(end, nextEnd)
    } else {
      groups.push([start, end])
      start = nextStart
      end = nextEnd
    }
  }
  groups.push([start, end])

  const body: string[] = []
  let additions = 0
  let deletions = 0

  for (const [groupStart, groupEnd] of groups) {
    const oldCount = oldBefore[groupEnd] - oldBefore[groupStart]
    const newCount = newBefore[groupEnd] - newBefore[groupStart]

    let firstOld: number | undefined
    let firstNew: number | undefined
    for (let index = groupStart; index < groupEnd; index++) {
      if (firstOld === undefined && rows[index].oldLine !== undefined) {
        firstOld = rows[index].oldLine
      }
      if (firstNew === undefined && rows[index].newLine !== undefined) {
        firstNew = rows[index].newLine
      }
      if (firstOld !== undefined && firstNew !== undefined) break
    }

    const oldStart = firstOld !== undefined ? firstOld + 1 : oldBefore[groupStart]
    const newStart = firstNew !== undefined ? firstNew + 1 : newBefore[groupStart]

    const func =
      status === "modified" ? functionContext(oldSplit.lines, oldStart) : undefined
    body.push(
      `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@${func ? ` ${func}` : ""}`,
    )

    for (let index = groupStart; index < groupEnd; index++) {
      const row = rows[index]
      const prefix = row.type === "equal" ? " " : row.type === "insert" ? "+" : "-"
      body.push(`${prefix}${render(row.text)}`)

      if (row.type === "insert") additions++
      else if (row.type === "delete") deletions++

      const oldMissingEol =
        row.oldLine !== undefined &&
        !oldSplit.finalNewline &&
        row.oldLine === oldSplit.lines.length - 1
      const newMissingEol =
        row.newLine !== undefined &&
        !newSplit.finalNewline &&
        row.newLine === newSplit.lines.length - 1

      if (oldMissingEol || newMissingEol) {
        body.push("\\ No newline at end of file")
      }
    }
  }

  return {
    patch: `${header.join("\n")}\n${body.join("\n")}\n`,
    additions,
    deletions,
    status,
    binary: false,
    truncated: result.truncated,
  }
}
