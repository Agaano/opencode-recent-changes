# Changelog

All notable changes to this project are documented here.

## [0.1.0] — 2026-11-10

### Added

- Per-request timeline: each user prompt is a step; changes are grouped by
  request and survive plugin reloads and Desktop restarts.
- Local, git-compatible unified diff engine (Myers, hunks, function context,
  `\ No newline`, CRLF, binary, git blob SHA-1 headers).
- Desktop review dialog with steps, file list, diff viewer, live refresh, and
  fullscreen mode.
- Per-step **Accept** / **Restore** / **Refresh** and **Copy patch**.
- Per-file **Accept** / **Restore** / **Refresh** with `reviewed` state.
- Step-by-step rollback with restore steps; history is never deleted.
- Conflict detection against external file changes with explicit overwrite.
- Content-addressed blob storage and a timeline index in plugin storage.
- 36 automated tests, including a manual-matrix suite (non-git, Cyrillic, CRLF,
  binary, large files, 50 files, 20 steps, subagent, reload).

### Known limitations

- Changes made only through shell commands are not tracked in tools mode.
- Rename detection is off (delete + add).
- Files over `maxFileSize` cannot be restored.
- The TUI part is not implemented yet.

[0.1.0]: https://example.invalid/recent-changes/releases/tag/v0.1.0
