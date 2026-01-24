#!/bin/bash

# Usage: ralph/prd-to-tasks.sh plan/some-feature.md
# Creates: ralph/some-feature.json

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <plan-file.md>"
  echo "Example: $0 plan/some-feature.md"
  exit 1
fi

SOURCE="@$1"
BASENAME=$(basename "$1" .md)
TARGET="ralph/${BASENAME}.json"

PROMPT="
Instructions:

$SOURCE

Convert my feature requirements into structured PRD items.
Each item should have: category, description, steps to verify, and passes: false.
Format as JSON. Be specific about acceptance criteria.
Store in $TARGET"

claude \
  --permission-mode acceptEdits \
  "$PROMPT"
