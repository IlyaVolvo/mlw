#!/usr/bin/env bash
set -euo pipefail

ROOT="public/dict"
VALIDATOR="scripts/validate_dictionary.py"
PYTHON="${PYTHON:-python3}"

DEBUG=0
for arg in "$@"; do
  case "$arg" in
    -d|--debug) DEBUG=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log_debug() { [[ "$DEBUG" -eq 1 ]] && echo "[DEBUG] $*" >&2; }

shopt -s nullglob

found=0
errors=0

for locale_dir in "$ROOT"/*/*; do

  [[ -d "$locale_dir" ]] || continue
  locale="$(basename "$locale_dir")"
  echo "Entering directory: $locale_dir (locale=$locale)"

  for dict_path in "$locale_dir"/dictionary-*.txt "$locale_dir"/answers-*.txt; do
    #echo $dict_path ...
    [[ -f "$dict_path" ]] || continue

    #echo $dict_path validated

    base="$(basename "$dict_path")"

    if [[ "$base" =~ ^(dictionary|answers)-([0-9]+)\.txt$ ]]; then
        kind="${BASH_REMATCH[1]}"   # "dictionary" or "answers"
        n="${BASH_REMATCH[2]}"      # the number
    else
        continue
    fi

    found=$((found + 1))
    echo "Processing: $dict_path (n=$n, locale=$locale)"

    # IMPORTANT: validator output is NOT redirected; PASS/FAIL always printed.
    if "$PYTHON" "$VALIDATOR" "$dict_path" -l "$locale" -c "$n"; then
    continue
      #echo "PASS  $dict_path"
    else
      echo "FAIL  $dict_path"
      errors=$((errors + 1))
    fi
  done
done

log_debug "Finished. Found=$found Errors=$errors"

# Optional: if you want *something* even when no files
if [[ "$found" -eq 0 ]]; then
  echo "NOFILES  matched $ROOT/*/*/dictionary-*.txt"
  exit 2
fi

exit $(( errors == 0 ? 0 : 1 ))