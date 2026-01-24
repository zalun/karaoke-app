#!/bin/bash

# Usage: ralph/afk.sh PRD.md TASKS.md

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

for ((i=1; i<=50; i++)); do

  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  claude \
  --permission-mode acceptEdits \
  --verbose \
  --print \
  --output-format stream-json \
  "$FILE_LIST \
  1. Find the first not started task and implement it. \
  2. Create unit tests. \
  3. Run your tests and type checks. \
  4. Update the JSON item with what was done. \
  5. Append your progress to progress.txt. \
  6. Commit your changes. \
  \
  ONLY WORK ON A SINGLE TASK. \
  If the PRD is complete, output <promise>COMPLETE</promise>." \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete after $i iterations."
    exit 0
  fi
done
