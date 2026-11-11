import fs from "node:fs/promises"
import path from "node:path"
import { lineStats } from "./diff/lines.ts"
import { gitBlobSha1 } from "./diff/format.ts"
import { toUnified, type UnifiedResult } from "./diff/unified.ts"
import { log } from "./log.ts"
import { isIgnored, looksLikePath, relPosix, resolveInside, sha256 } from "./paths.ts"
import { BlobStore, defaultCacheRoot, KeyedQueue, TimelineStore } from "./store.ts"
import {
  addVersion,
  closeStep,
  createTimeline,
  currentStep,
  ensureFile,
  hasChanges,
  openRestoreStep,
  openStep,
  truncatePrompt,
  versionAt,
  versionBefore,
  versionEquals,
  type SessionTimeline,
  type Step,
  type Version,
} from "./timeline.ts"

type ToolEvent = {
  tool: string
  sessionID: string
  agent: string
  messageID: string
  id: string
  input: unknown
  status?: "completed" | "error"
  result?: unknown
  error?: unknown
}

type PromptEvent = {
  sessionID: string
  messageID: string
  prompt: { text?: string }
}

type ServerEvent = {
  type: string
  data?: { sessionID?: string }
}

const PATH_KEYS = new Set([
  "filePath",
  "file_path",
  "filepath",
  "path",
  "file",
  "filename",
  "fileName",
  "target",
  "destination",
])

const DENY_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "bash",
  "shell",
  "webfetch",
  "websearch",
  "todo",
  "question",
  "skill",
  "task",
  "subagent",
  "artifact",
  "schedule",
])

const FILE_TOOL_HINTS = ["edit", "write", "patch", "create", "delete", "move", "rename", "file"]

export interface CaptureOptions {
  maxFileSize?: number
  contextLines?: number
  debug?: boolean
}

export interface TimelineStepInfo {
  index: number
  kind: Step["kind"]
  prompt?: string
  startedAt: number
  endedAt?: number
  status: Step["status"]
  restoreTo?: number
  additions: number
  deletions: number
  files: number
}

export interface TimelineInfo {
  steps: TimelineStepInfo[]
  acceptedStep: number
  currentStep: number
  totals: { additions: number; deletions: number; files: number }
}

export interface RevertResult {
  ok: boolean
  restored: string[]
  conflicts: string[]
  error?: "busy" | "missing_blob" | "invalid_step" | "invalid_file" | "io"
  step?: TimelineStepInfo
}

export interface AcceptResult {
  acceptedStep: number
}

export class Capture {
  private readonly blobs: BlobStore
  private readonly store: TimelineStore
  private readonly queue = new KeyedQueue()
  private readonly cache = new Map<string, SessionTimeline>()
  private readonly roots = new Map<string, string>()
  private readonly directories = new Map<string, string>()
  private readonly running = new Set<string>()
  private readonly disposers: Array<() => Promise<void> | void> = []
  private readonly abort = new AbortController()
  private readonly ctx: any
  private readonly onUpdate: (sessionID: string) => void
  private readonly debug: boolean
  private readonly contextLines: number

  constructor(
    ctx: any,
    onUpdate: (sessionID: string) => void,
    options: CaptureOptions = {},
  ) {
    this.ctx = ctx
    this.onUpdate = onUpdate
    this.debug = options.debug === true
    this.contextLines = options.contextLines ?? 3
    this.blobs = new BlobStore(defaultCacheRoot(), options.maxFileSize ?? 2 * 1024 * 1024)
    this.store = new TimelineStore(ctx, this.blobs)
  }

  async start(): Promise<void> {
    await this.blobs.init()

    const beforeHook = await this.ctx.tool.hook("execute.before", (event: ToolEvent) =>
      this.onBefore(event),
    )
    const afterHook = await this.ctx.tool.hook("execute.after", (event: ToolEvent) =>
      this.onAfter(event),
    )
    const promptHook = await this.ctx.session.hook("prompt", (event: PromptEvent) =>
      this.onPrompt(event),
    )

    this.disposers.push(() => beforeHook.dispose())
    this.disposers.push(() => afterHook.dispose())
    this.disposers.push(() => promptHook.dispose())
    this.disposers.push(() => this.abort.abort())

    void this.subscribe()
    log("capture started", this.ctx.location?.directory ?? "?")
  }

  async stop(): Promise<void> {
    this.abort.abort()
    for (const dispose of this.disposers.reverse()) {
      try {
        await dispose()
      } catch (error) {
        log("dispose error", error)
      }
    }
  }

  async timeline(sessionID: string): Promise<TimelineInfo> {
    const root = await this.rootSession(sessionID)
    if (this.debug) log("timeline request", sessionID, "root", root)
    return this.queue.run(root, async () => {
      const timeline = await this.loadFresh(root)
      if (this.debug) {
        log(
          "timeline loaded",
          root,
          "steps",
          timeline.steps.length,
          "files",
          Object.keys(timeline.files).length,
        )
      }
      const open = currentStep(timeline)

      if (open) {
        // Keep the request open while the agent is still working. The step is
        // closed by the next user prompt or by session.idle, never by a read.
        await this.computeStats(timeline, open)
      }

      return this.toInfo(timeline)
    })
  }

  async step(sessionID: string, stepIndex: number): Promise<{
    files: Array<{
      file: string
      status: "added" | "deleted" | "modified"
      additions: number
      deletions: number
      reviewed: boolean
    }>
  }> {
    const root = await this.rootSession(sessionID)
    return this.queue.run(root, async () => {
      const timeline = await this.loadFresh(root)
      const step = timeline.steps.find((candidate) => candidate.index === stepIndex)
      if (!step) return { files: [] }

      if (step.status === "open") {
        await this.computeStats(timeline, step)
      }

      const files: Array<{
        file: string
        status: "added" | "deleted" | "modified"
        additions: number
        deletions: number
        reviewed: boolean
      }> = []

      for (const relative of step.files) {
        const before = versionBefore(timeline, relative, step.index)
        const after = versionAt(timeline, relative, step.index)
        if (versionEquals(before, after)) continue

        const beforeContent = await this.blobs.get(before.blob)
        const afterContent = await this.blobs.get(after.blob)
        const stats = lineStats(
          beforeContent?.toString("utf8") ?? "",
          afterContent?.toString("utf8") ?? "",
        )

        files.push({
          file: relative,
          status: statusOf(before, after),
          additions: stats.additions,
          deletions: stats.deletions,
          reviewed: Boolean(
            timeline.files[relative]?.reviewed &&
              versionEquals(after, timeline.files[relative].reviewed!),
          ),
        })
      }

      files.sort((left, right) => left.file.localeCompare(right.file))
      return { files }
    })
  }

  async file(
    sessionID: string,
    stepIndex: number,
    relative: string,
  ): Promise<UnifiedResult> {
    const root = await this.rootSession(sessionID)
    return this.queue.run(root, async () => {
      const timeline = await this.loadFresh(root)
      const step = timeline.steps.find((candidate) => candidate.index === stepIndex)
      const empty: UnifiedResult = {
        patch: "",
        additions: 0,
        deletions: 0,
        status: "modified",
        binary: false,
        truncated: true,
      }
      if (!step || !step.files.includes(relative)) return empty

      const before = versionBefore(timeline, relative, step.index)
      const after = versionAt(timeline, relative, step.index)
      const beforeContent = await this.blobs.get(before.blob)
      const afterContent = await this.blobs.get(after.blob)

      if (
        (before.exists && beforeContent === undefined) ||
        (after.exists && afterContent === undefined)
      ) {
        return { ...empty, status: statusOf(before, after) }
      }

      const binary =
        Boolean(beforeContent?.includes(0)) || Boolean(afterContent?.includes(0))

      return toUnified(
        binary ? "" : beforeContent?.toString("utf8") ?? "",
        binary ? "" : afterContent?.toString("utf8") ?? "",
        {
          path: relative,
          oldExists: before.exists,
          newExists: after.exists,
          oldMode: before.mode,
          newMode: after.mode,
          context: this.contextLines,
          binary,
          oldSha: beforeContent ? gitBlobSha1(beforeContent) : undefined,
          newSha: afterContent ? gitBlobSha1(afterContent) : undefined,
        },
      )
    })
  }

  async revert(
    sessionID: string,
    stepIndex: number,
    force = false,
    file?: string,
  ): Promise<RevertResult> {
    const root = await this.rootSession(sessionID)
    return this.queue.run(root, async () => {
      const timeline = await this.loadFresh(root)
      const targetStep = timeline.steps.find((step) => step.index === stepIndex)
      if (!targetStep) return { ok: false, restored: [], conflicts: [], error: "invalid_step" }
      if (file && !timeline.files[file]) {
        return { ok: false, restored: [], conflicts: [], error: "invalid_file" }
      }

      const open = currentStep(timeline)
      if (open && this.running.has(root)) {
        return { ok: false, restored: [], conflicts: [], error: "busy" }
      }
      if (open) {
        await this.finalize(timeline, open)
        closeStep(timeline, Date.now(), "closed")
        await this.save(timeline)
      }

      const items: Array<{
        relative: string
        target: Version
        current: Version
        conflict: boolean
        missing: boolean
      }> = []

      for (const [relative, history] of Object.entries(timeline.files)) {
        if (file && relative !== file) continue

        const target = versionAt(timeline, relative, stepIndex)
        const current = await this.readVersion(path.join(timeline.directory, relative))
        const last = history.versions.at(-1)?.version ?? history.initial

        items.push({
          relative,
          target,
          current,
          conflict: !versionEquals(current, last),
          missing:
            target.exists &&
            (target.blob === undefined || (await this.blobs.get(target.blob)) === undefined),
        })
      }

      const conflicts = items.filter((item) => item.conflict).map((item) => item.relative)
      if (conflicts.length > 0 && !force) {
        return { ok: false, restored: [], conflicts }
      }

      const missing = items.filter((item) => item.missing).map((item) => item.relative)
      if (missing.length > 0) {
        return { ok: false, restored: [], conflicts: missing, error: "missing_blob" }
      }

      const changed = items.filter((item) => !versionEquals(item.current, item.target))
      if (changed.length === 0) {
        return { ok: true, restored: [], conflicts: [] }
      }

      try {
        for (const item of changed) {
          const absolute = path.join(timeline.directory, item.relative)
          if (item.target.exists) {
            const content = await this.blobs.get(item.target.blob)
            if (!content) {
              return {
                ok: false,
                restored: [],
                conflicts: [item.relative],
                error: "missing_blob",
              }
            }
            await writeFileAtomic(absolute, content, item.target.mode)
          } else {
            await fs.unlink(absolute).catch((error: any) => {
              if (error?.code !== "ENOENT") throw error
            })
          }
        }
      } catch (error) {
        log("revert io error", error)
        return { ok: false, restored: [], conflicts: [], error: "io" }
      }

      const step = openRestoreStep(timeline, stepIndex)
      if (file) step.prompt = `Restored ${file} to #${stepIndex}`
      for (const item of changed) {
        addVersion(timeline, item.relative, step.index, item.target, {})
      }

      await this.finalize(timeline, step)
      closeStep(timeline, Date.now(), "restored")
      await this.save(timeline)
      this.onUpdate(root)

      const result: RevertResult = {
        ok: true,
        restored: changed.map((item) => item.relative),
        conflicts: [],
      }
      const info = this.toInfo(timeline).steps.find((candidate) => candidate.index === step.index)
      if (info) result.step = info
      return result
    })
  }

  async accept(
    sessionID: string,
    stepIndex?: number,
    file?: string,
  ): Promise<AcceptResult> {
    const root = await this.rootSession(sessionID)
    return this.queue.run(root, async () => {
      const timeline = await this.loadFresh(root)
      const latest = timeline.steps[timeline.steps.length - 1]?.index ?? 0
      const target =
        stepIndex === undefined ? latest : Math.max(0, Math.min(stepIndex, latest))

      if (file) {
        const history = timeline.files[file]
        if (history) {
          history.reviewed = versionAt(timeline, file, target)
        }
      } else {
        timeline.acceptedStep = target
        const step = timeline.steps.find((candidate) => candidate.index === target)
        if (step) {
          for (const path of step.files) {
            const history = timeline.files[path]
            if (history) history.reviewed = versionAt(timeline, path, target)
          }
        }
      }

      await this.save(timeline)
      this.onUpdate(root)
      return { acceptedStep: timeline.acceptedStep }
    })
  }

  async reset(sessionID: string): Promise<{ ok: true }> {
    const root = await this.rootSession(sessionID)
    await this.queue.run(root, async () => {
      this.cache.delete(root)
      await this.store.remove(root)
      this.onUpdate(root)
    })
    return { ok: true }
  }

  private async onBefore(event: ToolEvent): Promise<void> {
    const paths = this.extractPaths(event.tool, event.input)
    if (paths.length === 0) {
      if (this.debug) log("before: no paths", event.tool, summarize(event.input))
      return
    }

    const root = await this.rootSession(event.sessionID)
    await this.queue.run(root, async () => {
      const timeline = await this.load(root)
      const step = currentStep(timeline) ?? openStep(timeline, undefined)

      for (const relative of paths) {
        const file = ensureFile(timeline, relative)
        if (file.initialized) continue
        file.initial = await this.readVersion(path.join(timeline.directory, relative))
        file.initialized = true
      }

      await this.save(timeline)
      if (this.debug) log("before", event.tool, paths, "step", step.index)
    })
  }

  private async onAfter(event: ToolEvent): Promise<void> {
    if (event.status && event.status !== "completed") return

    const paths = this.extractPaths(event.tool, event.input)
    if (paths.length === 0) {
      if (this.debug) log("after: no paths", event.tool, summarize(event.input))
      return
    }

    const root = await this.rootSession(event.sessionID)
    await this.queue.run(root, async () => {
      const timeline = await this.load(root)
      const step = currentStep(timeline) ?? openStep(timeline, undefined)

      for (const relative of paths) {
        const absolute = path.join(timeline.directory, relative)
        const file = ensureFile(timeline, relative)
        if (!file.initialized) {
          file.initial = await this.readVersion(absolute)
          file.initialized = true
        }

        const version = await this.readVersion(absolute)
        const previous = file.versions.at(-1)?.version
        if (previous && versionEquals(previous, version)) continue

        addVersion(timeline, relative, step.index, version, {
          tool: event.tool,
          toolCallID: event.id,
        })
      }

      await this.save(timeline)
      if (this.debug) log("after", event.tool, paths, "step", step.index)
      this.onUpdate(root)
    })
  }

  private async onPrompt(event: PromptEvent): Promise<void> {
    const root = await this.rootSession(event.sessionID)
    if (event.sessionID !== root) return

    await this.queue.run(root, async () => {
      const timeline = await this.load(root)
      const previous = currentStep(timeline)
      if (previous) {
        await this.finalize(timeline, previous)
        closeStep(timeline, Date.now(), "closed")
      }

      openStep(timeline, truncatePrompt(event.prompt?.text))
      await this.save(timeline)
      if (this.debug) log("prompt", root, truncatePrompt(event.prompt?.text))
      this.onUpdate(root)
    })
  }

  private async subscribe(): Promise<void> {
    const types = [
      "session.execution.started",
      "session.execution.succeeded",
      "session.execution.failed",
      "session.execution.interrupted",
      "session.idle",
    ]

    try {
      for await (const event of this.ctx.event.subscribe({ types, signal: this.abort.signal })) {
        try {
          await this.onEvent(event as ServerEvent)
        } catch (error) {
          log("event error", error)
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) log("subscribe error", error)
    }
  }

  private async onEvent(event: ServerEvent): Promise<void> {
    const sessionID = event.data?.sessionID
    if (!sessionID) return

    const root = await this.rootSession(sessionID)
    if (this.debug) {
      log("event", event.type, sessionID, "root", root, "running", this.running.has(root))
    }

    if (event.type === "session.execution.started") {
      this.running.add(root)
      return
    }

    if (sessionID !== root) return

    if (event.type === "session.execution.succeeded" || event.type === "session.idle") {
      if (event.type === "session.execution.succeeded") return
      this.running.delete(root)
      await this.queue.run(root, () => this.finish(root, "closed"))
      return
    }

    if (
      event.type === "session.execution.failed" ||
      event.type === "session.execution.interrupted"
    ) {
      this.running.delete(root)
      await this.queue.run(root, () => this.finish(root, "interrupted"))
    }
  }

  private async finish(root: string, status: Step["status"]): Promise<void> {
    const timeline = await this.load(root)
    const step = currentStep(timeline)
    if (!step) return

    await this.finalize(timeline, step)
    closeStep(timeline, Date.now(), status)
    await this.save(timeline)
    this.onUpdate(root)
  }

  private async finalize(timeline: SessionTimeline, step: Step): Promise<void> {
    for (const relative of step.files) {
      const absolute = path.join(timeline.directory, relative)
      const file = ensureFile(timeline, relative)
      const version = await this.readVersion(absolute)
      const previous = file.versions.at(-1)?.version
      if (!previous || !versionEquals(previous, version)) {
        addVersion(timeline, relative, step.index, version, {})
      }
    }

    await this.computeStats(timeline, step)
    step.endedAt = Date.now()
  }

  private async computeStats(timeline: SessionTimeline, step: Step): Promise<void> {
    let additions = 0
    let deletions = 0

    for (const relative of step.files) {
      const before = versionBefore(timeline, relative, step.index)
      const after = versionAt(timeline, relative, step.index)

      const beforeContent = await this.blobs.get(before.blob)
      const afterContent = await this.blobs.get(after.blob)
      if (before.exists && beforeContent === undefined) continue
      if (after.exists && afterContent === undefined) continue

      const stats = lineStats(
        beforeContent?.toString("utf8") ?? "",
        afterContent?.toString("utf8") ?? "",
      )
      additions += stats.additions
      deletions += stats.deletions
    }

    step.additions = additions
    step.deletions = deletions
  }

  private toInfo(timeline: SessionTimeline): TimelineInfo {
    if (!hasChanges(timeline)) {
      return {
        steps: [],
        acceptedStep: timeline.acceptedStep,
        currentStep: timeline.steps[timeline.steps.length - 1]?.index ?? 0,
        totals: { additions: 0, deletions: 0, files: 0 },
      }
    }

    const steps: TimelineStepInfo[] = timeline.steps
      .filter(
        (step) =>
          step.index > 0 && (step.files.length > 0 || step.status === "open"),
      )
      .map((step) => {
        const info: TimelineStepInfo = {
          index: step.index,
          kind: step.kind,
          startedAt: step.startedAt,
          status: step.status,
          additions: step.additions ?? 0,
          deletions: step.deletions ?? 0,
          files: step.files.length,
        }
        if (step.prompt !== undefined) info.prompt = step.prompt
        if (step.endedAt !== undefined) info.endedAt = step.endedAt
        if (step.restoreTo !== undefined) info.restoreTo = step.restoreTo
        return info
      })

    const totals = steps.reduce(
      (sum, step) => ({
        additions: sum.additions + step.additions,
        deletions: sum.deletions + step.deletions,
        files: sum.files + step.files,
      }),
      { additions: 0, deletions: 0, files: 0 },
    )

    return {
      steps,
      acceptedStep: timeline.acceptedStep,
      currentStep: timeline.steps[timeline.steps.length - 1]?.index ?? 0,
      totals,
    }
  }

  private async load(root: string): Promise<SessionTimeline> {
    const cached = this.cache.get(root)
    if (cached) return cached

    const stored = await this.store.load(root)
    if (stored) {
      this.cache.set(root, stored)
      return stored
    }

    // Do not cache a timeline this instance has not captured yet: another
    // plugin instance may persist the same session later, and the RPC reads
    // must see it.
    return createTimeline(
      root,
      this.directories.get(root) ?? this.ctx.location?.directory ?? process.cwd(),
    )
  }

  private async loadFresh(root: string): Promise<SessionTimeline> {
    const stored = await this.store.load(root)
    if (stored) {
      this.cache.set(root, stored)
      return stored
    }
    return this.load(root)
  }

  private async save(timeline: SessionTimeline): Promise<void> {
    this.cache.set(timeline.sessionID, timeline)
    await this.store.save(timeline)
  }

  private async rootSession(sessionID: string): Promise<string> {
    const cached = this.roots.get(sessionID)
    if (cached) return cached

    let current = sessionID
    let directory = this.ctx.location?.directory as string | undefined

    for (let depth = 0; depth < 16; depth++) {
      let info: any
      try {
        info = await this.ctx.session.get({ sessionID: current })
      } catch {
        break
      }

      directory = info?.location?.directory ?? directory
      const parent = info?.parentID
      if (!parent) break
      current = parent
    }

    this.roots.set(sessionID, current)
    if (directory) this.directories.set(current, directory)
    return current
  }

  private async readVersion(absolute: string): Promise<Version> {
    try {
      const stat = await fs.stat(absolute)
      if (!stat.isFile()) return { exists: false }

      const content = await fs.readFile(absolute)
      const hash = sha256(content)
      const { stored } = await this.blobs.put(content)

      return {
        exists: true,
        hash,
        blob: stored ? hash : undefined,
        size: content.length,
        mode: stat.mode,
      }
    } catch (error: any) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { exists: false }
      log("readVersion error", absolute, error?.message)
      return { exists: false }
    }
  }

  private extractPaths(tool: string, input: unknown): string[] {
    const base = tool.split(".").pop() ?? tool
    if (DENY_TOOLS.has(base)) return []

    const root = this.ctx.location?.directory as string | undefined
    if (!root) return []

    const allowByHint = FILE_TOOL_HINTS.some((hint) => base.toLowerCase().includes(hint))
    const found = new Set<string>()

    const add = (candidate: string, strong: boolean) => {
      if (!looksLikePath(candidate)) return
      if (!allowByHint && !strong) return

      const absolute = resolveInside(root, candidate)
      if (!absolute) return

      const relative = relPosix(root, absolute)
      if (!relative || isIgnored(relative)) return
      found.add(relative)
    }

    const visit = (value: unknown, depth: number): void => {
      if (depth > 5 || value === null || value === undefined) return

      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1)
        return
      }

      if (typeof value !== "object") return

      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (typeof entry === "string") {
          const strong = key === "filePath" || key === "file_path" || key === "filepath"
          if (PATH_KEYS.has(key)) add(entry, strong)
          else if (key === "patch" || key === "diff") parsePatch(entry, (candidate) => add(candidate, true))
          continue
        }
        visit(entry, depth + 1)
      }
    }

    visit(input, 0)
    return [...found]
  }
}

function parsePatch(text: string, add: (candidate: string) => void): void {
  if (text.length > 2_000_000) return

  for (const line of text.split(/\r?\n/)) {
    const fileHeader = line.match(/^\*\*\* (?:Update|Add|Delete|Move) File: (.+)$/)
    if (fileHeader) {
      add(fileHeader[1].trim())
      continue
    }

    const gitHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (gitHeader) {
      add(gitHeader[2].trim())
      continue
    }

    const plusHeader = line.match(/^\+\+\+ b\/(.+)$/)
    if (plusHeader) {
      add(plusHeader[1].trim())
    }
  }
}

function summarize(input: unknown): string {
  if (!input || typeof input !== "object") return String(input)
  return Object.keys(input as Record<string, unknown>).join(",")
}

async function writeFileAtomic(
  absolute: string,
  content: Buffer,
  mode?: number,
): Promise<void> {
  const directory = path.dirname(absolute)
  await fs.mkdir(directory, { recursive: true })

  const temporary = path.join(
    directory,
    `.rc-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  await fs.writeFile(temporary, content)
  if (mode !== undefined) {
    await fs.chmod(temporary, mode).catch(() => {})
  }

  try {
    await fs.rename(temporary, absolute)
  } catch {
    await fs.rm(absolute, { force: true })
    await fs.rename(temporary, absolute)
  }
}

function statusOf(before: Version, after: Version): "added" | "deleted" | "modified" {
  if (!before.exists && after.exists) return "added"
  if (before.exists && !after.exists) return "deleted"
  return "modified"
}
