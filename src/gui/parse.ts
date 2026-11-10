export interface DiffLine {
  kind: "add" | "del" | "ctx" | "meta"
  oldNo?: number
  newNo?: number
  text: string
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface ParsedPatch {
  meta: string[]
  hunks: DiffHunk[]
  binary: boolean
}

export function parsePatch(patch: string): ParsedPatch {
  const result: ParsedPatch = { meta: [], hunks: [], binary: false }
  let current: DiffHunk | undefined
  let oldNo = 0
  let newNo = 0

  for (const line of patch.split("\n")) {
    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      continue
    }

    if (line.startsWith("@@")) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
      if (match) {
        oldNo = Number(match[1])
        newNo = Number(match[3])
        current = { header: line, lines: [] }
        result.hunks.push(current)
        continue
      }
    }

    if (line.startsWith("Binary files ")) {
      result.binary = true
      result.meta.push(line)
      continue
    }

    if (!current) {
      if (line.trim()) result.meta.push(line)
      continue
    }

    if (line.startsWith("+")) {
      current.lines.push({ kind: "add", newNo, text: line.slice(1) })
      newNo++
    } else if (line.startsWith("-")) {
      current.lines.push({ kind: "del", oldNo, text: line.slice(1) })
      oldNo++
    } else if (line.startsWith(" ")) {
      current.lines.push({ kind: "ctx", oldNo, newNo, text: line.slice(1) })
      oldNo++
      newNo++
    } else if (line.startsWith("\\")) {
      current.lines.push({ kind: "meta", text: line })
    } else if (line.trim()) {
      current.lines.push({ kind: "meta", text: line })
    }
  }

  return result
}
