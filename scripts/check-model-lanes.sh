#!/usr/bin/env bash
# A break set with a patch that only a model can redden runs with a model
# (`patches_needing_model`, `lane_model_add` and `lane_serving_id` in
# scripts/e2e-lanes/lane-env.sh, wired into scripts/e2e-lanes/wt-break.sh).
# Held to that:
#
#   the header        a patch saying "Reddens only where a model answers" is
#                     named; one that does not, or is not there, is not
#   the lane list     the lane is added to RUNDESK_LANE_MODEL, which keeps the
#                     lanes it had; `all` and a lane already there are left be
#   the stamp         a lane serving a revision with a model is not the lane
#                     serving it without one
#   the runner        asks every patch of the set, adds the lane when one needs
#                     it, and stamps and compares what the lane serves, not the
#                     revision alone
#
# `found-24-sep/model-patches-measured-without-a-model`: the second drifted plan
# ran `wra-11` and `wra-12` with no model, and both read as reddening nothing.
#
# AND THE SAME FOR A LANE'S SEARCH ENGINE (`commit-log/log-68c0345-1`):
# RUNDESK_LANE_SEARCH is read in the model's spellings, a lane it names — and no
# other — is pointed at its own Meilisearch stub with its own key, every
# launcher starts the stub before the API and exports the two variables, a lane
# is reported searching only when its API logged the connection to that stub,
# and a patch saying "Reddens only where Meilisearch answers" gets its set a
# lane with one, stamped as such.
#
# --mutate runs the cases against broken copies of the helpers, the runner and
# the launchers.
#
#   bash scripts/check-model-lanes.sh [--mutate]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/breaks" "$TMP/logs-ok" "$TMP/logs-failed" "$TMP/logs-other"
printf '# Reddens only where a model answers: run it on a lane with a model.\n# Reddens: s: "x"\n' > "$TMP/breaks/needs-1.py"
printf '# Reddens: s: "y"\n# a comment that mentions where a model answers, not as the header says it\n' > "$TMP/breaks/plain-1.py"
printf '# Reddens only where no model answers: the refusal is its target.\n# Reddens: s: "z"\n' > "$TMP/breaks/none-1.py"
printf '# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.\n# Reddens: s: "w"\n' > "$TMP/breaks/search-1.py"
# An API log as Nest writes it — the colour codes around the words — for a lane
# that connected to its stub, one whose init failed, and one pointed at another
# lane's stub.
printf '\033[32m    LOG\033[39m \033[38;5;3m[SearchService] \033[39m\033[32mMeilisearch connected at http://127.0.0.1:9303\033[39m\n' > "$TMP/logs-ok/api-v3.log"
printf '\033[33m   WARN\033[39m \033[38;5;3m[SearchService] \033[39m\033[33mMeilisearch init failed: fetch failed\033[39m\n' > "$TMP/logs-failed/api-v3.log"
printf '\033[32m    LOG\033[39m \033[38;5;3m[SearchService] \033[39m\033[32mMeilisearch connected at http://127.0.0.1:9304\033[39m\n' > "$TMP/logs-other/api-v3.log"

cases () {
  local env="$1" runner="$2" launchers="${3:-$REPO/scripts/e2e-lanes}" bad=0 out
  fail () { echo "  $1"; bad=$((bad + 1)); }

  out=$(bash -c ". '$env'; patches_needing_model '$TMP/breaks' plain-1 needs-1 none-1 absent-1")
  [ "$out" = "needs-1" ] || fail "the header: named '$(echo "$out" | tr '\n' ' ')', not 'needs-1'"
  # And the other way round (`found-29-sep/no-model-patches-run-with-a-model`).
  out=$(bash -c ". '$env'; patches_needing_no_model '$TMP/breaks' plain-1 needs-1 none-1 absent-1")
  [ "$out" = "none-1" ] || fail "the no-model header: named '$(echo "$out" | tr '\n' ' ')', not 'none-1'"

  out=$(env -u RUNDESK_LANE_MODEL bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "7" ] || fail "the lane list, none before: '$out'"
  out=$(RUNDESK_LANE_MODEL=1 bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "1 7" ] || fail "the lane list, lane 1 before: '$out'"
  out=$(RUNDESK_LANE_MODEL=all bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "all" ] || fail "the lane list, all before: '$out'"
  out=$(RUNDESK_LANE_MODEL="3 7" bash -c ". '$env'; lane_model_add 7; echo \"\$RUNDESK_LANE_MODEL\"")
  [ "$out" = "3 7" ] || fail "the lane list, lane 7 already there: '$out'"
  env -u RUNDESK_LANE_MODEL bash -c ". '$env'; lane_model_add 7; lane_has_model 7" || fail 'the lane list: lane 7 added and still has no model'

  local without with
  without=$(env -u RUNDESK_LANE_MODEL -u RUNDESK_LANE_SEARCH bash -c ". '$env'; lane_serving_id abc123 7")
  with=$(env -u RUNDESK_LANE_SEARCH RUNDESK_LANE_MODEL=7 bash -c ". '$env'; lane_serving_id abc123 7")
  [ "$without" = "abc123" ] || fail "the stamp without a model: '$without'"
  [ -n "$with" ] && [ "$with" != "$without" ] || fail "the stamp: with a model '$with', without '$without'"

  grep -q 'patches_needing_model "$REPO/test/e2e/breaks" "$@"' "$runner" || fail 'the runner: does not ask the set’s patches'
  grep -q '^\[ -n "$NEEDS_MODEL" \] && lane_model_add "$LANE"$' "$runner" || fail 'the runner: does not add the lane'
  grep -q 'patches_needing_no_model "$REPO/test/e2e/breaks" "$@"' "$runner" || fail 'the runner: does not ask which patches need no model'
  grep -q '^if \[ -n "$NEEDS_MODEL" \] && \[ -n "$NEEDS_NO_MODEL" \]; then$' "$runner" || fail 'the runner: runs a set wanting a model and none on one lane'
  grep -q '^\[ -n "$NEEDS_NO_MODEL" \] && lane_model_remove "$LANE"$' "$runner" || fail 'the runner: leaves the model on for a set that needs none'
  grep -q '^SERVING="$(lane_serving_id "$REV" "$LANE")"$' "$runner" || fail 'the runner: does not work out what it serves'
  grep -q '!= "$SERVING" \]; then$' "$runner" || fail 'the runner: compares the stamp with the revision alone'
  grep -q '"$REV" > "$STAMP"' "$runner" && fail 'the runner: stamps the revision alone'
  [ "$(grep -c '"$SERVING" > "$STAMP"' "$runner")" = 2 ] || fail 'the runner: does not stamp what it serves, after the sync and after the set'
  # The model is decided before the stamp is read, or the stamp answers for a
  # lane that is about to change.
  local add stamp
  add=$(grep -n 'lane_model_add "$LANE"' "$runner" | head -1 | cut -d: -f1)
  stamp=$(grep -n '^SERVING=' "$runner" | head -1 | cut -d: -f1)
  [ -n "$add" ] && [ -n "$stamp" ] && [ "$add" -lt "$stamp" ] || fail "the runner: the lane is added at line ${add:-none}, after the stamp at ${stamp:-none}"

  # ── search (`commit-log/log-68c0345-1`) ────────────────────────────────────
  out=$(bash -c ". '$env'; patches_needing_search '$TMP/breaks' plain-1 needs-1 search-1 absent-1")
  [ "$out" = "search-1" ] || fail "the search header: named '$(echo "$out" | tr '\n' ' ')', not 'search-1'"
  # The model's spellings: unset is none, `all` is every lane, a list is those
  # lanes and no others — "13" is not lane 3.
  local spec want lanes
  for spec in "unset|no" "all|yes" "3|yes" "1 3 7|yes" "1 7|no" "13|no"; do
    lanes="${spec%%|*}"; want="${spec##*|}"
    if [ "$lanes" = unset ]; then
      out=$(env -u RUNDESK_LANE_SEARCH bash -c ". '$env'; lane_has_search 3 && echo yes || echo no")
    else
      out=$(RUNDESK_LANE_SEARCH="$lanes" bash -c ". '$env'; lane_has_search 3 && echo yes || echo no")
    fi
    [ "$out" = "$want" ] || fail "the search lane list '$lanes': lane 3 has search '$out', expected '$want'"
  done
  out=$(RUNDESK_LANE_SEARCH=1 bash -c ". '$env'; lane_search_add 7; echo \"\$RUNDESK_LANE_SEARCH\"")
  [ "$out" = "1 7" ] || fail "the search lane list, lane 1 before adding 7: '$out'"
  out=$(RUNDESK_LANE_SEARCH=all bash -c ". '$env'; lane_search_add 7; echo \"\$RUNDESK_LANE_SEARCH\"")
  [ "$out" = "all" ] || fail "the search lane list, all before adding 7: '$out'"
  # A named lane is pointed at ITS OWN stub, with its own key; any other lane
  # is given nothing, so the API reads whatever it would have read.
  out=$(RUNDESK_LANE_SEARCH=3 env -u MEILISEARCH_URL -u MEILISEARCH_MASTER_KEY bash -c ". '$env'; lane_search_env 3; echo \"\${MEILISEARCH_URL:-unset}|\${MEILISEARCH_MASTER_KEY:-unset}\"")
  [ "$out" = "http://127.0.0.1:9303|stub-search-key-v3" ] || fail "the search env for lane 3: '$out'"
  out=$(RUNDESK_LANE_SEARCH=3 env -u MEILISEARCH_URL -u MEILISEARCH_MASTER_KEY bash -c ". '$env'; lane_search_env 4; echo \"\${MEILISEARCH_URL:-unset}|\${MEILISEARCH_MASTER_KEY:-unset}\"")
  [ "$out" = "unset|unset" ] || fail "the search env for lane 4, which is not named: '$out'"
  # The stub starts with its flag and the key the API is given, from the
  # helpers' own directory.
  grep -qF 'RUNDESK_MEILI_STUB=1 nohup node "$LANE_ENV_DIR/meili-stub.mjs" --port "$port" --key "$(lane_search_key "$k")"' "$env" \
    || fail 'the search stub: not started with its flag and the lane’s key'
  # Searching means the API logged the connection to this lane's own stub.
  RUNDESK_LANE_SEARCH=3 LANE_LOG_DIR="$TMP/logs-ok" bash -c ". '$env'; lane_search_ready 3" \
    || fail 'search ready: an API that connected to its stub is not read as searching'
  RUNDESK_LANE_SEARCH=3 LANE_LOG_DIR="$TMP/logs-failed" bash -c ". '$env'; lane_search_ready 3" \
    && fail 'search ready: an API whose init failed is read as searching'
  RUNDESK_LANE_SEARCH=3 LANE_LOG_DIR="$TMP/logs-other" bash -c ". '$env'; lane_search_ready 3" \
    && fail "search ready: an API connected to another lane's stub is read as searching"
  env -u RUNDESK_LANE_SEARCH LANE_LOG_DIR="$TMP/logs-failed" bash -c ". '$env'; lane_search_ready 3" \
    || fail 'search ready: a lane without search is not ready'
  # The stamp: search, a model, both and neither are four different lanes.
  local s_none s_search s_model s_both
  s_none=$(env -u RUNDESK_LANE_MODEL -u RUNDESK_LANE_SEARCH bash -c ". '$env'; lane_serving_id abc123 7")
  s_search=$(env -u RUNDESK_LANE_MODEL RUNDESK_LANE_SEARCH=7 bash -c ". '$env'; lane_serving_id abc123 7")
  s_model=$(env -u RUNDESK_LANE_SEARCH RUNDESK_LANE_MODEL=7 bash -c ". '$env'; lane_serving_id abc123 7")
  s_both=$(RUNDESK_LANE_SEARCH=7 RUNDESK_LANE_MODEL=7 bash -c ". '$env'; lane_serving_id abc123 7")
  [ "$(printf '%s\n' "$s_none" "$s_search" "$s_model" "$s_both" | sort -u | wc -l)" = 4 ] \
    || fail "the stamp with search: none '$s_none', search '$s_search', model '$s_model', both '$s_both'"
  # The runner: asks every patch, adds the lane before the stamp, and its
  # restart starts the stub and points the API at it.
  grep -q 'patches_needing_search "$REPO/test/e2e/breaks" "$@"' "$runner" || fail 'the runner: does not ask which patches need the index'
  grep -q '^\[ -n "$NEEDS_SEARCH" \] && lane_search_add "$LANE"$' "$runner" || fail 'the runner: does not add the search lane'
  add=$(grep -n 'lane_search_add "$LANE"' "$runner" | head -1 | cut -d: -f1)
  [ -n "$add" ] && [ -n "$stamp" ] && [ "$add" -lt "$stamp" ] || fail "the runner: the search lane is added at line ${add:-none}, after the stamp at ${stamp:-none}"
  grep -q '^  lane_search_up "$LANE"$' "$runner" || fail 'the runner: its restart starts no search stub'
  grep -q '^    lane_search_env "$LANE"$' "$runner" || fail 'the runner: its restart does not point the API at the stub'
  # Every launcher: the stub before the API, the variables in its environment.
  local f
  for f in fleet-up.sh fleet-sync.sh fleet-restart.sh; do
    grep -q '^  lane_search_up "$k"$' "$launchers/$f" || fail "$f: starts no search stub"
    grep -q '^    lane_search_env "$k"$' "$launchers/$f" || fail "$f: does not point the API at the stub"
    grep -q 'lane_search_ready "$k"' "$launchers/$f" || fail "$f: reports a lane up without asking whether it searches"
  done
  return $bad
}

ENV="$REPO/scripts/e2e-lanes/lane-env.sh"
RUNNER="$REPO/scripts/e2e-lanes/wt-break.sh"
if cases "$ENV" "$RUNNER"; then
  echo "ok model lanes: a set with a patch only a model can redden runs with one, and the stamp says so"
  echo "ok search lanes: RUNDESK_LANE_SEARCH names the lanes that search through a stub of their own, every launcher wires it, and a set that needs it gets it"
else
  echo "not ok model lanes"; exit 1
fi
[ "${1:-}" = --mutate ] || exit 0

# FILE|sed expression. Each is applied to a copy of that file alone.
MUTANTS=(
  # The header not read: no patch ever needs a model.
  "env|s/^    grep -q '\\^# Reddens only where a model answers' \"\\\$dir\\/\\\$p.py\" 2>\\/dev\\/null \\&\\& echo \"\\\$p\"\$/    :/"
  # The lane list replaced, not added to: the lanes it had lose their model.
  "env|s/^  export RUNDESK_LANE_MODEL=\"\\\$\\{RUNDESK_LANE_MODEL:\\+\\\$RUNDESK_LANE_MODEL \\}\\\$k\"\$/  export RUNDESK_LANE_MODEL=\"\\\$k\"/"
  # The stamp blind to the model: a lane without one passes for a lane with.
  "env|s/^  if lane_has_model \"\\\$k\"; then echo \"\\\$rev \\+model\"; else echo \"\\\$rev\"; fi\$/  echo \"\\\$rev\"/"
  # The runner never adds the lane.
  "runner|s/^\\[ -n \"\\\$NEEDS_MODEL\" \\] \\&\\& lane_model_add \"\\\$LANE\"\$/:/"
  # The no-model header not read.
  "env|s/^    grep -q '\\^# Reddens only where no model answers' \"\\\$dir\\/\\\$p.py\" 2>\\/dev\\/null \\&\\& echo \"\\\$p\"\$/    :/"
  # A set wanting both, run on one lane.
  "runner|s/^if \\[ -n \"\\\$NEEDS_MODEL\" \\] \\&\\& \\[ -n \"\\\$NEEDS_NO_MODEL\" \\]; then\$/if false; then/"
  # The model left on for a set that needs none.
  "runner|s/^\\[ -n \"\\\$NEEDS_NO_MODEL\" \\] \\&\\& lane_model_remove \"\\\$LANE\"\$/:/"
  # The runner stamps the revision alone, after the sync and at the end of a
  # set (the restore's stamp moved inside its checked branch in 8e398c1).
  "runner|s/^  echo \"\\\$SERVING\" > \"\\\$STAMP\"\$/  echo \"\\\$REV\" > \"\\\$STAMP\"/"
)
caught=0
for i in "${!MUTANTS[@]}"; do
  which="${MUTANTS[$i]%%|*}"
  expr="${MUTANTS[$i]#*|}"
  e="$ENV"; r="$RUNNER"
  if [ "$which" = env ]; then
    e="$TMP/env-$i.sh"; sed -E "$expr" "$ENV" > "$e"; orig="$ENV"; m="$e"
  else
    r="$TMP/runner-$i.sh"; sed -E "$expr" "$RUNNER" > "$r"; orig="$RUNNER"; m="$r"
  fi
  if cmp -s "$m" "$orig"; then
    echo "  mutation $((i + 1)) CHANGED NOTHING — its pattern no longer matches"; continue
  fi
  if cases "$e" "$r" > /dev/null; then echo "  mutation $((i + 1)) SURVIVED: $expr"
  else caught=$((caught + 1)); fi
done
if [ "$caught" = "${#MUTANTS[@]}" ]; then
  echo "ok $caught of ${#MUTANTS[@]} mutations of the model-lane rule are caught"
else
  echo "not ok only $caught of ${#MUTANTS[@]} mutations are caught"; exit 1
fi

# THE SEARCH MUTATIONS, as exact text: what to find (once, or the mutation says
# it measures nothing) and what to put there, in a copy of one file — `env`,
# `runner`, or a launcher by name.
S_WHICH=(); S_FROM=(); S_TO=(); S_WHAT=()
smut () { S_WHICH+=("$1"); S_WHAT+=("$2"); S_FROM+=("$3"); S_TO+=("$4"); }
smut env 'every lane searches, whatever the list says' \
  'local k="$1" want="${RUNDESK_LANE_SEARCH:-}" n' 'local k="$1" want="all" n'
smut env 'a lane added replaces the search lanes it had' \
  'export RUNDESK_LANE_SEARCH="${RUNDESK_LANE_SEARCH:+$RUNDESK_LANE_SEARCH }$k"' 'export RUNDESK_LANE_SEARCH="$k"'
smut env 'the search header is not read' \
  "grep -q '^# Reddens only where Meilisearch answers' \"\$dir/\$p.py\" 2>/dev/null && echo \"\$p\"" ':'
smut env 'the API is not pointed at the stub' \
  'export MEILISEARCH_URL="http://127.0.0.1:$(lane_search_port "$k")"' ':'
smut env 'the API is not given the key' \
  'export MEILISEARCH_MASTER_KEY="$(lane_search_key "$k")"' ':'
smut env 'the stub starts without the key' \
  ' --key "$(lane_search_key "$k")" >> "$log"' ' >> "$log"'
smut env 'a lane is read as searching without looking' \
  'grep -a -q "Meilisearch connected at http://127.0.0.1:$(lane_search_port "$k")"' 'grep -a -q "Meilisearch connected at"'
smut env 'the stamp is blind to search' \
  '  lane_has_search "$k" && rev="$rev +search"' '  :'
smut runner 'the runner never adds the search lane' \
  '[ -n "$NEEDS_SEARCH" ] && lane_search_add "$LANE"' ':'
smut runner "the runner's restart starts no stub" \
  '  lane_search_up "$LANE"' '  :'
smut runner "the runner's restart does not point the API at it" \
  '    lane_search_env "$LANE"' '    :'
smut fleet-restart.sh 'fleet-restart does not point the API at it' \
  '    lane_search_env "$k"' '    :'
smut fleet-up.sh 'fleet-up starts no stub' \
  '  lane_search_up "$k"' '  :'
smut fleet-sync.sh 'fleet-sync reports a lane up without asking whether it searches' \
  'if [ -n "$up" ] && lane_search_ready "$k"; then' 'if [ -n "$up" ]; then'

# Exactly once, or say so: a pattern that moved measures nothing.
replace_once () {
  node -e '
    const fs = require("fs")
    const [src, dst, from, to] = process.argv.slice(1)
    const s = fs.readFileSync(src, "utf8")
    const n = s.split(from).length - 1
    if (n !== 1) { console.log(n); process.exit(3) }
    fs.writeFileSync(dst, s.split(from).join(to))' "$1" "$2" "$3" "$4"
}
scaught=0
for i in "${!S_WHICH[@]}"; do
  e="$ENV"; r="$RUNNER"; l="$REPO/scripts/e2e-lanes"
  case "${S_WHICH[$i]}" in
    env) src="$ENV"; dst="$TMP/s-env-$i.sh"; e="$dst" ;;
    runner) src="$RUNNER"; dst="$TMP/s-runner-$i.sh"; r="$dst" ;;
    *) l="$TMP/s-launchers-$i"; mkdir -p "$l"
       cp "$REPO/scripts/e2e-lanes/fleet-up.sh" "$REPO/scripts/e2e-lanes/fleet-sync.sh" "$REPO/scripts/e2e-lanes/fleet-restart.sh" "$l/"
       src="$REPO/scripts/e2e-lanes/${S_WHICH[$i]}"; dst="$l/${S_WHICH[$i]}" ;;
  esac
  if ! found=$(replace_once "$src" "$dst" "${S_FROM[$i]}" "${S_TO[$i]}"); then
    echo "  search mutation '${S_WHAT[$i]}' FOUND ITS TEXT ${found:-?} TIMES — it measures nothing"; continue
  fi
  if cases "$e" "$r" "$l" > /dev/null; then echo "  search mutation SURVIVED: ${S_WHAT[$i]}"
  else scaught=$((scaught + 1)); fi
done
if [ "$scaught" = "${#S_WHICH[@]}" ]; then
  echo "ok $scaught of ${#S_WHICH[@]} mutations of the search-lane wiring are caught"
else
  echo "not ok only $scaught of ${#S_WHICH[@]} search mutations are caught"; exit 1
fi
