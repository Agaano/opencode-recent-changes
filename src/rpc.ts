import { Rpc } from "@opencode/plugin/rpc"

export interface TimelineTotals {
  additions: number
  deletions: number
  files: number
}

export interface StepInfo {
  index: number
  kind: "baseline" | "request" | "restore"
  prompt?: string
  startedAt: number
  endedAt?: number
  status: "open" | "closed" | "interrupted" | "restored"
  restoreTo?: number
  additions: number
  deletions: number
  files: number
}

export interface TimelineResult {
  steps: StepInfo[]
  acceptedStep: number
  currentStep: number
  totals: TimelineTotals
}

export interface StepFileInfo {
  file: string
  status: "added" | "deleted" | "modified"
  additions: number
  deletions: number
  reviewed: boolean
}

export interface StepResult {
  files: StepFileInfo[]
}

export interface FileResult {
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
  binary: boolean
  truncated: boolean
}

export interface RevertResult {
  ok: boolean
  restored: string[]
  conflicts: string[]
  error?: "busy" | "missing_blob" | "invalid_step" | "io"
  step?: StepInfo
}

export interface AcceptResult {
  acceptedStep: number
}

export const RecentChanges = Rpc.define({
  id: "recent-changes",
  methods: {
    timeline: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "number" },
                kind: { type: "string", enum: ["baseline", "request", "restore"] },
                prompt: { type: "string" },
                startedAt: { type: "number" },
                endedAt: { type: "number" },
                status: { type: "string", enum: ["open", "closed", "interrupted", "restored"] },
                restoreTo: { type: "number" },
                additions: { type: "number" },
                deletions: { type: "number" },
                files: { type: "number" },
              },
              required: ["index", "kind", "startedAt", "status", "additions", "deletions", "files"],
              additionalProperties: false,
            },
          },
          acceptedStep: { type: "number" },
          currentStep: { type: "number" },
          totals: {
            type: "object",
            properties: {
              additions: { type: "number" },
              deletions: { type: "number" },
              files: { type: "number" },
            },
            required: ["additions", "deletions", "files"],
            additionalProperties: false,
          },
        },
        required: ["steps", "acceptedStep", "currentStep", "totals"],
        additionalProperties: false,
      },
    },
    step: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          step: { type: "number" },
        },
        required: ["sessionID", "step"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                status: { type: "string", enum: ["added", "deleted", "modified"] },
                additions: { type: "number" },
                deletions: { type: "number" },
                reviewed: { type: "boolean" },
              },
              required: ["file", "status", "additions", "deletions", "reviewed"],
              additionalProperties: false,
            },
          },
        },
        required: ["files"],
        additionalProperties: false,
      },
    },
    reset: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    },
    file: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          step: { type: "number" },
          file: { type: "string" },
        },
        required: ["sessionID", "step", "file"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          patch: { type: "string" },
          additions: { type: "number" },
          deletions: { type: "number" },
          status: { type: "string", enum: ["added", "deleted", "modified"] },
          binary: { type: "boolean" },
          truncated: { type: "boolean" },
        },
        required: ["patch", "additions", "deletions", "status", "binary", "truncated"],
        additionalProperties: false,
      },
    },
    revert: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          step: { type: "number" },
          force: { type: "boolean" },
          file: { type: "string" },
        },
        required: ["sessionID", "step"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          restored: { type: "array", items: { type: "string" } },
          conflicts: { type: "array", items: { type: "string" } },
          error: {
            type: "string",
            enum: ["busy", "missing_blob", "invalid_step", "invalid_file", "io"],
          },
          step: {
            type: "object",
            properties: {
              index: { type: "number" },
              kind: { type: "string", enum: ["baseline", "request", "restore"] },
              prompt: { type: "string" },
              startedAt: { type: "number" },
              endedAt: { type: "number" },
              status: { type: "string", enum: ["open", "closed", "interrupted", "restored"] },
              restoreTo: { type: "number" },
              additions: { type: "number" },
              deletions: { type: "number" },
              files: { type: "number" },
            },
            required: ["index", "kind", "startedAt", "status", "additions", "deletions", "files"],
            additionalProperties: false,
          },
        },
        required: ["ok", "restored", "conflicts"],
        additionalProperties: false,
      },
    },
    accept: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          step: { type: "number" },
          file: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          acceptedStep: { type: "number" },
        },
        required: ["acceptedStep"],
        additionalProperties: false,
      },
    },
  },
  events: {
    updated: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
    },
  },
})
