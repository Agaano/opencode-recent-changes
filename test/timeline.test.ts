import assert from "node:assert/strict"
import test from "node:test"
import {
  addVersion,
  closeStep,
  createTimeline,
  currentStep,
  openStep,
  truncatePrompt,
  versionAt,
  versionBefore,
} from "../src/core/timeline.ts"

test("baseline step is created", () => {
  const timeline = createTimeline("ses_test", "C:/project", 1000)
  assert.equal(timeline.steps.length, 1)
  assert.equal(timeline.steps[0].index, 0)
  assert.equal(timeline.steps[0].kind, "baseline")
  assert.equal(timeline.acceptedStep, 0)
})

test("a new step closes the previous open one", () => {
  const timeline = createTimeline("ses_test", "C:/project", 1000)
  const first = openStep(timeline, "first request", 2000)
  assert.equal(first.index, 1)
  assert.equal(currentStep(timeline)?.index, 1)

  const second = openStep(timeline, "second request", 3000)
  assert.equal(second.index, 2)
  assert.equal(timeline.steps[1].status, "closed")
  assert.equal(timeline.steps[1].endedAt, 3000)
  assert.equal(currentStep(timeline)?.index, 2)
})

test("versions are read before and at a step", () => {
  const timeline = createTimeline("ses_test", "C:/project", 1000)
  openStep(timeline, "one", 2000)
  addVersion(timeline, "a.txt", 1, { exists: true, hash: "v1" }, { at: 2100 })

  openStep(timeline, "two", 3000)
  addVersion(timeline, "a.txt", 2, { exists: true, hash: "v2" }, { at: 3100 })

  assert.equal(versionBefore(timeline, "a.txt", 2).hash, "v1")
  assert.equal(versionAt(timeline, "a.txt", 2).hash, "v2")
  assert.equal(versionBefore(timeline, "a.txt", 1).exists, false)
  assert.equal(versionAt(timeline, "a.txt", 1).hash, "v1")
})

test("step files list each path once", () => {
  const timeline = createTimeline("ses_test", "C:/project", 1000)
  const step = openStep(timeline, "one", 2000)
  addVersion(timeline, "a.txt", step.index, { exists: true, hash: "v1" })
  addVersion(timeline, "a.txt", step.index, { exists: true, hash: "v2" })
  assert.deepEqual(step.files, ["a.txt"])
})

test("closeStep is idempotent", () => {
  const timeline = createTimeline("ses_test", "C:/project", 1000)
  openStep(timeline, "one", 2000)
  assert.equal(closeStep(timeline, 3000, "closed")?.status, "closed")
  assert.equal(closeStep(timeline, 4000, "closed"), undefined)
})

test("prompts are truncated and whitespace-normalized", () => {
  assert.equal(truncatePrompt("  hello   world  "), "hello world")
  assert.equal(truncatePrompt("a".repeat(200))?.length, 120)
  assert.equal(truncatePrompt("   "), undefined)
})
