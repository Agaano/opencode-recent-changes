export interface Version {
  exists: boolean
  /** sha256 of the content, when the file existed. */
  hash?: string
  /** sha256 blob key, when the content was stored. */
  blob?: string
  size?: number
  mode?: number
}

export interface VersionEntry {
  step: number
  at: number
  version: Version
  tool?: string
  toolCallID?: string
}

export interface FileHistory {
  path: string
  initialized: boolean
  initial: Version
  versions: VersionEntry[]
  /** Version the user last marked as reviewed for this file. */
  reviewed?: Version
}

export interface Step {
  id: string
  index: number
  kind: "baseline" | "request" | "restore"
  prompt?: string
  startedAt: number
  endedAt?: number
  status: "open" | "closed" | "interrupted" | "restored"
  restoreTo?: number
  files: string[]
  additions?: number
  deletions?: number
}

export interface SessionTimeline {
  version: 1
  sessionID: string
  directory: string
  createdAt: number
  acceptedStep: number
  steps: Step[]
  files: Record<string, FileHistory>
}

export function createTimeline(
  sessionID: string,
  directory: string,
  now = Date.now(),
): SessionTimeline {
  return {
    version: 1,
    sessionID,
    directory,
    createdAt: now,
    acceptedStep: 0,
    steps: [
      {
        id: "st_0000",
        index: 0,
        kind: "baseline",
        startedAt: now,
        endedAt: now,
        status: "closed",
        files: [],
      },
    ],
    files: {},
  }
}

export function openStep(timeline: SessionTimeline, prompt: string | undefined, now = Date.now()): Step {
  const previous = currentStep(timeline)
  if (previous) closeStep(timeline, now)

  const index = timeline.steps.length
  const step: Step = {
    id: `st_${String(index).padStart(4, "0")}`,
    index,
    kind: "request",
    prompt,
    startedAt: now,
    status: "open",
    files: [],
    additions: 0,
    deletions: 0,
  }
  timeline.steps.push(step)
  return step
}

export function closeStep(
  timeline: SessionTimeline,
  now = Date.now(),
  status: Step["status"] = "closed",
): Step | undefined {
  const step = currentStep(timeline)
  if (!step) return undefined
  step.status = status
  step.endedAt = now
  return step
}

export function openRestoreStep(
  timeline: SessionTimeline,
  restoreTo: number,
  now = Date.now(),
): Step {
  const previous = currentStep(timeline)
  if (previous) closeStep(timeline, now)

  const index = timeline.steps.length
  const step: Step = {
    id: `st_${String(index).padStart(4, "0")}`,
    index,
    kind: "restore",
    prompt: `Restored to #${restoreTo}`,
    startedAt: now,
    status: "open",
    restoreTo,
    files: [],
    additions: 0,
    deletions: 0,
  }
  timeline.steps.push(step)
  return step
}

export function currentStep(timeline: SessionTimeline): Step | undefined {
  return timeline.steps.find((step) => step.status === "open")
}

export function lastStep(timeline: SessionTimeline): Step | undefined {
  return timeline.steps[timeline.steps.length - 1]
}

export function ensureFile(timeline: SessionTimeline, relativePath: string): FileHistory {
  const existing = timeline.files[relativePath]
  if (existing) return existing

  const created: FileHistory = {
    path: relativePath,
    initialized: false,
    initial: { exists: false },
    versions: [],
  }
  timeline.files[relativePath] = created
  return created
}

export function addVersion(
  timeline: SessionTimeline,
  relativePath: string,
  stepIndex: number,
  version: Version,
  meta: { at?: number; tool?: string; toolCallID?: string } = {},
): VersionEntry {
  const file = ensureFile(timeline, relativePath)
  const entry: VersionEntry = {
    step: stepIndex,
    at: meta.at ?? Date.now(),
    version,
    tool: meta.tool,
    toolCallID: meta.toolCallID,
  }
  file.versions.push(entry)

  const step = timeline.steps.find((candidate) => candidate.index === stepIndex)
  if (step && !step.files.includes(relativePath)) step.files.push(relativePath)

  return entry
}

export function versionBefore(
  timeline: SessionTimeline,
  relativePath: string,
  stepIndex: number,
): Version {
  const file = timeline.files[relativePath]
  if (!file) return { exists: false }

  for (let index = file.versions.length - 1; index >= 0; index--) {
    if (file.versions[index].step < stepIndex) return file.versions[index].version
  }
  return file.initial
}

export function versionAt(
  timeline: SessionTimeline,
  relativePath: string,
  stepIndex: number,
): Version {
  const file = timeline.files[relativePath]
  if (!file) return { exists: false }

  for (let index = file.versions.length - 1; index >= 0; index--) {
    if (file.versions[index].step <= stepIndex) return file.versions[index].version
  }
  return file.initial
}

export function versionEquals(left: Version, right: Version): boolean {
  if (left.exists !== right.exists) return false
  if (!left.exists) return true
  return left.hash === right.hash
}

export function hasChanges(timeline: SessionTimeline): boolean {
  return Object.keys(timeline.files).length > 0
}

export function truncatePrompt(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
