#!/bin/sh
# Stage all changes and open editor to write/edit commit message.
# Usage: ./scripts/commit.sh   or  npm run commit
set -e
git add -A
git status
exec git commit
