# HomeKaraoke Development Instructions

## Context Files
- `CLAUDE.md` - Project overview and architecture
- `plan/` - Technical specifications

## Development Guidelines

### Before Starting Any Task
1. Read `CLAUDE.md` for project conventions and coding standards
2. Check `@fix_plan.md` for the next item to solve

## Objectives
1. Review `@fix_plan.md` for current tasks
2. Implement the highest priority incomplete item
3. Run build to verify changes
4. Mark task complete in `@fix_plan.md`
5. Move to next task


## Code Quality Checks
```bash
just check              # Quick health check
just test               # Run unit tests
just e2e                # Run E2E tests (ask before running)
just ci                 # Full CI simulation
```

## Out of Scope for Autonomous Development

- Database migrations (require careful review)
- Version bumps (manual process in 3 files)
- GitHub releases (requires human approval)
- E2E tests without user consent (can be slow)
- Changes to security-sensitive code paths

## Reference Documentation

- `CLAUDE.md` - Claude Code instructions and conventions
- `plan/README.md` - Planning document index
- `plan/architecture.md` - Project structure overview
- `tests/e2e/GUIDE.md` - E2E testing patterns

## Workflow
1. Read `@fix_plan.md`
2. Pick highest priority `[ ]` task
3. Implement it
4. Run `npm run build`
5. Mark task `[x]` in `@fix_plan.md`
6. Repeat until all tasks complete

## Status Block (Required)
End every response with:

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION
EXIT_SIGNAL: false | true
RECOMMENDATION: <next action>
---END_RALPH_STATUS---
```

Set `EXIT_SIGNAL: true` only when ALL tasks in `@fix_plan.md` are `[x]` and build passes.
