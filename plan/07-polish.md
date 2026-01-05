# Phase 8: Polish

**Status:** Planned

**Result:** Application ready for daily use

## Fullscreen Video Mode

- [ ] Toggle fullscreen <-> windowed without interrupting playback
- [ ] Queue continues automatically in fullscreen (without exiting)
- [ ] Shortcut: F or double-click -> toggle fullscreen
- [ ] ESC -> exit fullscreen (but not pause)

## Keyboard Shortcuts

> Shortcuts inactive when focus is on text input (input/textarea)

### Global (both windows)

| Key | Action |
|-----|--------|
| `Space` | Play/pause |
| `N` | Next video |
| `M` | Mute/unmute |
| `Up` / `Down` | Volume +/-10% |

### Video Window

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `ESC` | Exit fullscreen |
| `Left` / `Right` | Seek +/-10s |

### Management Window

| Key | Action |
|-----|--------|
| `Cmd+O` | Add file to queue |
| `Cmd+F` / `/` | Focus on search |
| `Delete` | Remove selected from queue |
| `Enter` | Play selected / confirm action |

## Other Polish Items

- [ ] Error handling and feedback
- [ ] Loading states
- [ ] Application icon
- [ ] Empty states (no search results, empty queue, etc.)
- [ ] Tooltips on buttons
- [ ] Confirmation dialogs for destructive actions

## Technical Considerations

### Fullscreen

- Use native fullscreen API (don't reload component)
- Preserve `<video>` element reference during transition
- Handle fullscreen events from system (e.g., green button on macOS)

### Keyboard Shortcuts

- Use `useEffect` with `keydown` event listener
- Check `document.activeElement` to skip when in input
- Prevent default for handled keys
