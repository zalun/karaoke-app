#!/bin/bash

# Build file list with @ prefix
FILE_LIST=""
for file in "$@"; do
  FILE_LIST="$FILE_LIST @$file"
done

claude --permission-mode acceptEdits "$FILE_LIST \
1. Read the PRD and progress file. \
2. Find the next incomplete task and implement it. \
3. Commit your changes. \
4. Update progress.txt with what you did. \
ONLY DO ONE TASK AT A TIME."
