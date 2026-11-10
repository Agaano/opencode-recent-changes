export interface DiffOp {
  type: "equal" | "insert" | "delete"
  a?: number
  b?: number
  text: string
}

export interface DiffResult {
  ops: DiffOp[]
  truncated: boolean
}

export function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines
}

export function isBinary(text: string): boolean {
  return text.includes("\0")
}

/**
 * Myers O(ND) diff over lines. Falls back to "replace everything" when the
 * edit distance exceeds `maxD`, which keeps pathological inputs bounded.
 */
export function diffLines(a: string[], b: string[], maxD = 4000): DiffResult {
  const n = a.length
  const m = b.length

  if (n === 0 && m === 0) return { ops: [], truncated: false }
  if (n === 0) {
    return {
      ops: b.map((text, index) => ({ type: "insert" as const, b: index, text })),
      truncated: false,
    }
  }
  if (m === 0) {
    return {
      ops: a.map((text, index) => ({ type: "delete" as const, a: index, text })),
      truncated: false,
    }
  }

  const limit = Math.min(n + m, maxD)
  const v = new Map<number, number>()
  v.set(1, 0)
  const trace: Array<Map<number, number>> = []

  for (let d = 0; d <= limit; d++) {
    trace.push(new Map(v))
    for (let k = -d; k <= d; k += 2) {
      const down = v.get(k + 1)
      const right = v.get(k - 1)
      let x: number

      if (k === -d || (k !== d && (right ?? Number.NEGATIVE_INFINITY) < (down ?? Number.NEGATIVE_INFINITY))) {
        x = down ?? 0
      } else {
        x = (right ?? 0) + 1
      }

      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v.set(k, x)

      if (x >= n && y >= m) {
        return { ops: backtrack(trace, a, b, d), truncated: false }
      }
    }
  }

  return {
    ops: [
      ...a.map((text, index) => ({ type: "delete" as const, a: index, text })),
      ...b.map((text, index) => ({ type: "insert" as const, b: index, text })),
    ],
    truncated: true,
  }
}

function backtrack(
  trace: Array<Map<number, number>>,
  a: string[],
  b: string[],
  distance: number,
): DiffOp[] {
  const ops: DiffOp[] = []
  let x = a.length
  let y = b.length

  for (let d = distance; d >= 0; d--) {
    const v = trace[d]
    const k = x - y
    const right = v.get(k - 1)
    const down = v.get(k + 1)

    const previousK =
      k === -d || (k !== d && (right ?? Number.NEGATIVE_INFINITY) < (down ?? Number.NEGATIVE_INFINITY))
        ? k + 1
        : k - 1

    const previousX = v.get(previousK) ?? 0
    const previousY = previousX - previousK

    while (x > previousX && y > previousY) {
      x--
      y--
      ops.push({ type: "equal", a: x, b: y, text: a[x] })
    }

    if (d === 0) break

    if (x === previousX) {
      y--
      ops.push({ type: "insert", b: y, text: b[y] })
    } else {
      x--
      ops.push({ type: "delete", a: x, text: a[x] })
    }
  }

  return ops.reverse()
}

export function lineStats(
  before: string,
  after: string,
): { additions: number; deletions: number; binary: boolean; truncated: boolean } {
  if (isBinary(before) || isBinary(after)) {
    return { additions: 0, deletions: 0, binary: true, truncated: false }
  }

  const result = diffLines(splitLines(before), splitLines(after))
  let additions = 0
  let deletions = 0
  for (const op of result.ops) {
    if (op.type === "insert") additions++
    else if (op.type === "delete") deletions++
  }
  return { additions, deletions, binary: false, truncated: result.truncated }
}
