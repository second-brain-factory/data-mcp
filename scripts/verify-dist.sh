#!/usr/bin/env bash
# verify-dist.sh — T0 byte-comparability gate (issue-1219, factory-dev).
#
# Builds src/ with tsc into a scratch dir and compares every emitted
# .js and .d.ts against the canonical dist/ (synced from the published
# @iwo-szapar/data-mcp@0.6.0 tarball).
#
# Diff policy (evidence: docs/verify-dist-allowlist.md):
#   PASS     — byte-identical
#   PASS-A   — Class A: differs only by trailing newline (canon files were
#              editor-touched after the original tsc build; tsc emits none)
#   ALLOW-B  — Class B: canon file is hand-authored/stale (never compiler
#              output). Listed in scripts/verify-dist-allowlist.txt and
#              verified semantically (see docs/verify-dist-allowlist.md)
#   FATAL    — any other code diff
#
# Sourcemaps (.js.map / .d.ts.map) diffs are WARN only.
# EXTRA emitted files are acceptable when canon simply lacks them for
# hand-authored modules (superset); they are listed in the allowlist with
# an "extra:" prefix. Any other EXTRA is FATAL.
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOWLIST=scripts/verify-dist-allowlist.txt

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

npx tsc --outDir "$SCRATCH" >/dev/null

fatal=0
warn=0
missing=0
classa=0
allowb=0

in_allowlist() {
  grep -qxF "$1" "$ALLOWLIST" 2>/dev/null
}

newline_only_diff() {
  # true if files differ only by presence/absence of a trailing newline
  diff <(printf '%s\n' "$(cat "$1")") <(printf '%s\n' "$(cat "$2")") >/dev/null 2>&1
}

while IFS= read -r f; do
  rel=${f#dist/}
  if [[ ! -f "$SCRATCH/$rel" ]]; then
    echo "MISSING (not emitted): $rel"
    missing=$((missing+1))
    continue
  fi
  if ! cmp -s "$f" "$SCRATCH/$rel"; then
    case "$rel" in
      *.map) warn=$((warn+1)) ;;
      *)
        if newline_only_diff "$f" "$SCRATCH/$rel"; then
          classa=$((classa+1))
        elif in_allowlist "$rel"; then
          echo "ALLOW-B (hand-authored canon): $rel"
          allowb=$((allowb+1))
        else
          echo "FATAL (code differs): $rel"
          fatal=$((fatal+1))
        fi
        ;;
    esac
  fi
done < <(find dist -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.map' \) | sort)

# Extra files emitted that aren't in canonical dist
while IFS= read -r f; do
  rel=${f#"$SCRATCH"/}
  if [[ ! -f "dist/$rel" ]]; then
    if in_allowlist "extra:$rel"; then
      allowb=$((allowb+1))
    else
      echo "EXTRA (emitted, not in dist): $rel"
      fatal=$((fatal+1))
    fi
  fi
done < <(find "$SCRATCH" -type f | sort)

echo "---"
echo "fatal=$fatal missing=$missing classA=$classa allowB=$allowb mapWarn=$warn"
if [[ $fatal -gt 0 || $missing -gt 0 ]]; then
  echo "verify-dist: FAIL"
  exit 1
fi
echo "verify-dist: PASS"
