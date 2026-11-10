export const panelCss = `
.rc-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--color-text-base, inherit);
}

.rc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  flex: 0 0 auto;
  min-width: 0;
}

.rc-title {
  font-weight: 600;
  white-space: nowrap;
}

.rc-muted {
  opacity: 0.55;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-spacer {
  flex: 1 1 auto;
}

.rc-totals {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  opacity: 0.75;
  white-space: nowrap;
}

.rc-action {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0.7;
  cursor: pointer;
}

.rc-action:hover {
  opacity: 1;
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.rc-action:disabled {
  opacity: 0.3;
  cursor: default;
}

.rc-add {
  color: var(--diffs-addition-color, var(--color-text-success, #3fb950));
}

.rc-del {
  color: var(--diffs-deletion-color, var(--color-text-danger, #f85149));
}

.rc-layout {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
}

.rc-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  overflow: hidden;
}

.rc-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rc-section-steps {
  flex: 0 1 42%;
}

.rc-section-files {
  flex: 1 1 58%;
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}

.rc-section-title {
  flex: 0 0 auto;
  padding: 8px 10px 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.6;
}

.rc-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.rc-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rc-empty {
  padding: 20px 14px;
  opacity: 0.6;
  line-height: 1.5;
}

.rc-error {
  padding: 20px 14px;
  color: var(--color-text-danger, #e5484d);
  line-height: 1.5;
}

.rc-footer {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  font-size: 11px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-steps {
  display: flex;
  flex-direction: column;
}

.rc-step {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rc-step:hover {
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.rc-step-active {
  background: color-mix(in srgb, currentColor 9%, transparent);
}

.rc-step-dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--color-text-weak, #888);
}

.rc-step-dot[data-status="open"] {
  background: var(--color-text-interactive-base, #4c8dff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-text-interactive-base, #4c8dff) 22%, transparent);
}

.rc-step-dot[data-status="interrupted"] {
  background: var(--color-text-warning, #d29922);
}

.rc-step-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rc-step-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-step-check {
  margin-right: 4px;
  color: var(--diffs-addition-color, #3fb950);
}

.rc-step-meta {
  font-size: 11px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-step-stats {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  white-space: nowrap;
}

.rc-files {
  display: flex;
  flex-direction: column;
}

.rc-file {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.rc-file:hover {
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.rc-file-active {
  background: color-mix(in srgb, currentColor 9%, transparent);
}

.rc-file-main {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 6px 7px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rc-file-action {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  opacity: 0.55;
  cursor: pointer;
}

.rc-file-action:hover {
  opacity: 1;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.rc-file-status {
  display: inline-block;
  min-width: 14px;
  padding: 1px 0;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-family: var(--diffs-font-family, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.rc-file-status[data-status="added"] {
  color: var(--diffs-addition-color, #3fb950);
}

.rc-file-status[data-status="deleted"] {
  color: var(--diffs-deletion-color, #f85149);
}

.rc-file-status[data-status="modified"] {
  color: var(--color-text-warning, #d29922);
}

.rc-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--diffs-font-family, ui-monospace, monospace);
  font-size: 11px;
}

.rc-file-stats {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  white-space: nowrap;
}

.rc-diff {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.rc-diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  flex: 0 0 auto;
  min-width: 0;
}

.rc-diff-header .rc-file-path {
  flex: 1 1 auto;
  font-size: 12px;
}

.rc-diff-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  font-family: var(--diffs-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--diffs-font-size, 12px);
  line-height: 1.5;
}

.rc-hunk {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 3px 10px;
  border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  background: var(--diffs-bg-context, color-mix(in srgb, currentColor 5%, transparent));
  color: var(--color-text-weak, #888);
  white-space: pre;
}

.rc-line {
  display: grid;
  grid-template-columns: 44px 44px 16px minmax(0, 1fr);
  min-width: max-content;
}

.rc-line-add {
  background: var(--diffs-bg-addition, rgba(46, 160, 67, 0.15));
}

.rc-line-del {
  background: var(--diffs-bg-deletion, rgba(248, 81, 73, 0.15));
}

.rc-line-ctx {
  background: var(--diffs-bg-context, transparent);
}

.rc-ln {
  padding-right: 8px;
  color: var(--diffs-fg-number, color-mix(in srgb, currentColor 45%, transparent));
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
}

.rc-sign {
  opacity: 0.7;
  text-align: center;
  user-select: none;
}

.rc-code {
  padding-right: 12px;
  white-space: pre;
}

.rc-line-meta {
  padding: 3px 10px;
  color: var(--color-text-weak, #888);
  font-style: italic;
  white-space: pre;
}

.rc-narrow-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rc-narrow-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  min-width: 0;
}

.rc-compact {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
}

.rc-compact-count {
  font-size: 11px;
  opacity: 0.6;
}

.rc-compact-open {
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  writing-mode: vertical-rl;
}

.rc-dialog-body {
  display: flex;
  flex-direction: column;
  height: min(40vh, 320px);
  min-height: 240px;
  overflow: hidden;
}

.rc-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.rc-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 10px 14px 12px;
  background: var(--color-background-base, #111);
  color: var(--color-text-base, #eee);
}

.rc-fullscreen-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  min-width: 0;
}

.rc-fullscreen-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rc-back {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  opacity: 0.8;
  cursor: pointer;
}

.rc-back:hover {
  opacity: 1;
}
`
