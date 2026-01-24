#!/bin/bash

# Usage: ralph/afk.sh PRD.json [other files...]

# Build file list with @ prefix
FILE_LIST=""
for file in "$@"; do
  FILE_LIST="$FILE_LIST @$file"
done

set -e

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

PROMPT="$FILE_LIST

Instructions:
- Find the first not started task and implement it.
- Create unit tests if possible.
- Run your tests and type checks.
- Update the JSON item with what was done.
- Append your progress to progress.txt.
- Commit your changes.

Before committing, run ALL feedback loops:
1. TypeScript: npm run typecheck (must pass with no errors)
2. Tests: npm run test (must pass)
3. Lint: npm run lint (must pass)
Do NOT commit if any feedback loop fails. Fix issues first.

After completing each task, append to progress.txt:
- Task completed and PRD item reference
- Key decisions made and reasoning
- Files changed
- Any blockers or notes for next iteration
Keep entries concise. Sacrifice grammar for concision. This file helps future iterations skip exploration.

ONLY WORK ON A SINGLE TASK.
If the PRD is complete, output <promise>COMPLETE</promise>."

for ((i=1; i<=50; i++)); do

  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  claude \
    --permission-mode acceptEdits \
    --verbose \
    --print \
    --output-format stream-json \
    "$PROMPT" \
    | grep --line-buffered '^{' \
    | tee "$tmpfile" \
    | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete after $i iterations."
    exit 0
  fi
done
