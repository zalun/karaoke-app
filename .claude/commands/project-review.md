Review all changes in the current branch compared to main, including uncommitted work.

IMPORTANT:
- Do NOT switch branches
- Do NOT suggest switching branches
- If there are no changes, just say "No changes to review" and stop

## Steps

1. Detect the default branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` (fallback to `main` if not set)
2. Verify we're on a branch: `git branch --show-current` (if empty, we're in detached HEAD state - warn the user)
3. Run `git status` to check repository state (staged, unstaged, untracked files, ahead/behind status)
4. Run `git diff <default-branch>...HEAD` to see committed changes between default branch and current branch
5. Run `git diff` to see uncommitted changes in working directory
6. Run `git ls-files --others --exclude-standard` to see untracked files (respects .gitignore)
7. For large diffs (50+ files), run `git diff --stat <default-branch>...HEAD` first for overview, then review file-by-file

## Output Format

Structure your review as follows:

## Code Review: [Brief description]

### Summary
[1-2 sentence overview of the changes]

### Strengths
- [What's done well]

### Issues & Suggestions

#### [Issue title] (`path/to/file:line`)
**Issue:** [Description]
**Suggested Fix:** [How to fix]

### Security Considerations
[PASS/FAIL - explanation]

### Test Coverage
[Are tests added/needed?]

### Performance Considerations
[Any performance concerns?]

### Verdict
[APPROVE / APPROVE with suggestions / REQUEST CHANGES]
[Brief explanation]

### Suggested Follow-up Actions
Based on `git status` output from Step 2, suggest appropriate actions:

**If issues were found:**
- [ ] Fix [specific issue] in `path/to/file`
- [ ] Add tests for [component/function]
- [ ] Address security concern in [location]

**If code is clean, check git status output:**
- If "Changes not staged for commit" or "Changes to be committed" exist: suggest stage, commit, and push
- If "Untracked files" exist (not in .gitignore): suggest add, commit, and push
- If working tree is clean AND branch is ahead of origin: check `gh pr view`:
  - If PR exists: suggest `git push` to update PR
  - If no PR: suggest `gh pr create`
- If working tree is clean AND branch is up to date: nothing to do

Ask: "Would you like me to help with any of these?"

## Review Criteria

Analyze ALL changes (committed, uncommitted, AND untracked files) for:

### Database Backward Compatibility (if `src-tauri/src/db/schema.rs` is modified)

Check that database migrations are safe for upgrades from v0.5.1-beta onwards:

1. **Migration Safety Rules:**
   - New migrations MUST be appended to `MIGRATIONS` array (never modify existing migrations)
   - Use `CREATE TABLE IF NOT EXISTS` for new tables
   - Use `CREATE INDEX IF NOT EXISTS` for new indexes
   - Use `ALTER TABLE ADD COLUMN` with nullable columns (existing rows get NULL)
   - Use `DROP TABLE IF EXISTS` only for tables that were never used or after data migration

2. **Destructive Operations (REQUIRE data migration):**
   - `DROP TABLE` on tables with user data - MUST copy data first
   - `DROP COLUMN` (SQLite requires table recreation) - MUST preserve data
   - Changing column types - MUST handle conversion
   - Removing/changing `CHECK` constraints - verify existing data is valid
   - Table recreation pattern (create new → copy data → drop old → rename) - verify INSERT copies ALL columns

3. **Check for data loss scenarios:**
   - If dropping a table: Was it used in v0.5.1+? If yes, data must be migrated
   - If recreating a table: Does INSERT copy all existing columns?
   - If adding NOT NULL columns: Is there a DEFAULT value?

4. **Review Output:**
   - **PASS**: All migrations are additive or use safe patterns with data preservation
   - **FAIL**: Found potentially destructive operations without data migration
   - List specific concerns with line numbers

### Code Quality
- Bugs and logic errors
- Missing error handling
- Edge cases
- Code readability and maintainability
- Potential performance issues

### New/Untracked Files
- Review untracked files for inclusion - should they be committed or added to .gitignore?
- Ensure new files follow project structure conventions

Be concise. Skip sections that don't apply. For small changes, use abbreviated format.
