# Phase 7: Polish

**GitHub Issue:** #192

See `plan/07-polish.md` for full specification.

---

## P2: Fullscreen Video Mode
- [x] Toggle fullscreen <-> windowed without interrupting playback
- [x] Queue continues automatically in fullscreen
- [x] Shortcuts: F or double-click -> toggle fullscreen
- [x] ESC -> exit fullscreen (but not pause)

## P2: Keyboard Shortcuts - Global
- [x] Space: Play/pause
- [x] M: Mute/unmute
- [x] Up/Down: Volume +/-10%
- [x] N: Next video

## P2: Keyboard Shortcuts - Video Window
- [x] F: Toggle fullscreen
- [x] ESC: Exit fullscreen
- [x] Left/Right: Seek +/-10s

## P3: Keyboard Shortcuts - Management Window
- [ ] Cmd+O: Add file to queue
- [x] Cmd+F or /: Focus on search and switch to Search tab
- [ ] Delete: Remove selected from queue
- [ ] Enter: Play selected / confirm action
- [ ] Tab: Switch to next panel (Search/Player/Library)
- [ ] Arrow keys: Navigate through search results and library items

## P3: UX Polish
- [ ] Loading states for all async operations
- [ ] Empty states (no search results, empty queue, etc.)
- [ ] Tooltips on buttons
- [ ] Confirmation dialogs for destructive actions

---

## Completion Criteria

A task is complete when:
1. Code compiles without warnings
2. `just check` passes (typecheck + lint + cargo check)
3. **New tests added** for testable functionality
4. All tests pass (`just test`)
5. Changelog updated (if user-facing change)

---

## Workflow for Ralph

### At Phase Start
1. Create ONE GitHub issue for the phase: "Phase 7: Polish"
2. Create feature branch: `feature/<issue-number>-phase-7-polish`
3. Update the "GitHub Issue:" line at the top of this file with the issue number

### During Development Loop
1. Pick next unchecked task
2. **Write failing test first** (when testable):
   - Unit test in `src/**/*.test.ts` for logic/utilities
   - Component test for React components
   - Skip tests for pure UI changes (styles, layouts)
3. Implement the feature until test passes
4. Run `just check` before committing
5. Commit with descriptive message
6. **Add comment to the GitHub issue** noting completed task:
   ```bash
   gh issue comment <issue-number> --body "Completed: <task description>"
   ```
7. Mark task as done in this file: `- [x]`
8. Push commits regularly
9. Repeat until all tasks are checked

### At Phase End
1. Verify all tasks are `[x]` checked
2. Run `just test` to confirm no regressions
3. Update `CHANGELOG.md` with user-facing changes
4. Create PR referencing the issue: `gh pr create`
5. **STOP** - wait for human approval before next phase

### Guidelines
- Ask user before running E2E tests (`just e2e`)
- Do not merge PRs - only humans can approve and merge
- If stuck on a task, comment on the issue and move to next task
