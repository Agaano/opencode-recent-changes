import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Capture } from "../src/core/capture.ts"

function fakeContext(directory: string) {
  const storage = new Map<string, unknown>()

  return {
    storage,
    ctx: {
      location: { directory },
      options: {},
      app: { version: "test" },
      storage: {
        get: async (key: string) => storage.get(key),
        set: async (key: string, value: unknown) => {
          storage.set(key, value)
        },
        remove: async (key: string) => {
          storage.delete(key)
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => ({
          id: sessionID,
          location: { directory },
        }),
        hook: async () => ({ dispose: async () => {} }),
      },
      tool: {
        list: async () => [],
        hook: async () => ({ dispose: async () => {} }),
      },
      event: {
        subscribe: async function* () {
          // No server events in this unit test.
        },
      },
    },
  }
}

function toolEvent(file: string, id: string) {
  return {
    tool: "write",
    sessionID: "ses_root",
    agent: "build",
    messageID: "msg_1",
    id,
    input: { filePath: file },
    status: "completed" as const,
  }
}

test("capture groups changes by user prompt and records versions", async (t) => {  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-capture-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { ctx } = fakeContext(directory)
  const capture = new Capture(ctx, () => {})
  await (capture as any).blobs.init()

  const file = path.join(directory, "b.txt")

  await (capture as any).onPrompt({
    sessionID: "ses_root",
    messageID: "msg_1",
    prompt: { text: "first request" },
  })
  await (capture as any).onBefore(toolEvent(file, "call_1"))
  await fs.writeFile(file, "one\ntwo\n")
  await (capture as any).onAfter(toolEvent(file, "call_1"))

  let timeline = await capture.timeline("ses_root")
  assert.equal(timeline.steps.length, 1)
  assert.equal(timeline.steps[0].prompt, "first request")
  assert.equal(timeline.steps[0].files, 1)
  assert.equal(timeline.steps[0].additions, 2)

  let step = await capture.step("ses_root", 1)
  assert.deepEqual(step.files, [
    { file: "b.txt", status: "added", additions: 2, deletions: 0, reviewed: false },
  ])

  await (capture as any).onPrompt({
    sessionID: "ses_root",
    messageID: "msg_2",
    prompt: { text: "second request" },
  })
  await (capture as any).onBefore(toolEvent(file, "call_2"))
  await fs.writeFile(file, "one\nTWO\n")
  await (capture as any).onAfter(toolEvent(file, "call_2"))

  timeline = await capture.timeline("ses_root")
  assert.equal(timeline.steps.length, 2)
  assert.equal(timeline.steps[1].prompt, "second request")
  assert.equal(timeline.steps[1].additions, 1)
  assert.equal(timeline.steps[1].deletions, 1)

  step = await capture.step("ses_root", 2)
  assert.deepEqual(step.files, [
    { file: "b.txt", status: "modified", additions: 1, deletions: 1, reviewed: false },
  ])

  await capture.reset("ses_root")
  timeline = await capture.timeline("ses_root")
  assert.deepEqual(timeline.steps, [])
})

test("patch headers are parsed and ignored paths are skipped", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-paths-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { ctx } = fakeContext(directory)
  const capture = new Capture(ctx, () => {})

  const paths = (capture as any).extractPaths("patch", {
    patch: [
      "*** Begin Patch",
      "*** Update File: src/a.ts",
      "@@",
      "-x",
      "+y",
      "*** Add File: src/b.ts",
      "+new",
      "*** End Patch",
    ].join("\n"),
  })

  assert.deepEqual(paths.sort(), ["src/a.ts", "src/b.ts"])

  const ignored = (capture as any).extractPaths("write", {
    filePath: path.join(directory, "node_modules", "x.js"),
  })
  assert.deepEqual(ignored, [])
})
