import { For, Show } from "solid-js"
import type { StepInfo } from "../rpc.ts"

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function StepTimeline(props: {
  steps: StepInfo[]
  selected: number | undefined
  acceptedStep?: number
  onSelect: (index: number) => void
}) {
  return (
    <div class="rc-steps">
      <For each={props.steps}>
        {(step) => (
          <button
            type="button"
            class="rc-step"
            classList={{ "rc-step-active": step.index === props.selected }}
            onClick={() => props.onSelect(step.index)}
          >
            <span class="rc-step-dot" data-status={step.status} />
            <span class="rc-step-main">
              <span class="rc-step-title">
                <Show
                  when={
                    props.acceptedStep !== undefined && step.index <= props.acceptedStep
                  }
                >
                  <span class="rc-step-check" title="Reviewed">
                    ✓
                  </span>
                </Show>
                #{step.index} {step.prompt ?? "request"}
              </span>
              <span class="rc-step-meta">
                {formatTime(step.startedAt)} · {step.files}{" "}
                {step.files === 1 ? "file" : "files"}
                {step.kind === "restore" && step.restoreTo !== undefined
                  ? ` · restored to #${step.restoreTo}`
                  : ""}
                {step.status === "open" ? " · running…" : ""}
              </span>
            </span>
            <span class="rc-step-stats">
              <span class="rc-add">+{step.additions}</span>{" "}
              <span class="rc-del">−{step.deletions}</span>
            </span>
          </button>
        )}
      </For>
    </div>
  )
}
