#!/usr/bin/env bash
# THE LANE'S STORAGE, IN ONE PLACE, BECAUSE FOUR PLACES IS A DEFECT CLASS.
#
# Four scripts start a lane's API — `fleet-up.sh`, `fleet-sync.sh`,
# `fleet-restart.sh` and `wt-break.sh` — and each one carries its own copy of
# the environment. Adding the storage variables to each of them by hand would
# be the duplicated list this audit keeps finding: the interesting failure is
# not all four drifting, it is ONE of them drifting, so a suite measures the
# real upload path in a normal lane and the unconfigured path in a break lane
# while reporting the same sentences either way. That is a green that means two
# different things depending on which script started the API.
#
# So both halves live here and every launcher sources them.
#
#   lane_store_up  <k>   start lane k's object store, wait for it to say ready
#   lane_store_env <k>   export the four variables that point the API at it
#
# WHY A STORE AT ALL. The ledger had the cover picker's Upload tab down as
# unmeasurable for want of credentials this repository does not hold. It was
# never credentials: `R2Service` already reads `R2_ENDPOINT` and already sets
# `forcePathStyle: true`, so any S3-compatible endpoint finishes presign → PUT
# → commit with no product change. `s3-stub.mjs` is that endpoint and
# `check-s3-stub.mjs` drives the real SDK against it every preflight.
#
# ONE STORE PER LANE, for the same reason each lane has its own database: two
# lanes sharing a bucket would let one suite's objects answer another's reads,
# and the stub's arranged-failure seam would fire on whichever PUT arrived
# first. Lane k gets port 91<k> and bucket `rundesk-v<k>`.

# Absolute, so a caller that has `cd`'d into a worktree still finds the stub —
# and finds the MAIN one, which no break patch can have rewritten under it.
LANE_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

lane_store_port () { echo $((9100 + $1)); }
lane_store_bucket () { echo "rundesk-v$1"; }

lane_store_env () {
  local k="$1"
  export R2_ENDPOINT="http://127.0.0.1:$(lane_store_port "$k")"
  export R2_ACCESS_KEY_ID=stub-key
  export R2_SECRET_ACCESS_KEY=stub-secret
  export R2_BUCKET_NAME="$(lane_store_bucket "$k")"
}

# IS THE STUB ON <port> RUNNING THE SOURCE IN <file>? Both stubs report a hash
# of their own source at `/__control/version`; a stub from before a change, or
# one too old to have the route at all, answers something else and is
# restarted. Keeping a running stub is right — its state is the lane's — but
# only while it is the stub the tree describes.
stub_is_current () {
  local port="$1" file="$2" want
  want="$(sha1sum "$file" | cut -c1-12)"
  curl -s --noproxy '*' --max-time 2 "http://127.0.0.1:$port/__control/version" 2>/dev/null |
    grep -q "\"source\":\"$want\""
}

lane_store_up () {
  local k="$1"
  local port bucket log
  port="$(lane_store_port "$k")"
  bucket="$(lane_store_bucket "$k")"
  log="/tmp/claude-0/s3-v$k.log"

  # Already listening for this lane — leave it, and leave its objects alone.
  # A restart that emptied the bucket would make a suite's second run differ
  # from its first for a reason nothing in the suite mentions.
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/s3-stub.mjs"; then
    return 0
  fi

  pkill -f "s3-stub.mjs --port $port " 2>/dev/null
  : > "$log"
  RUNDESK_S3_STUB=1 nohup node "$LANE_ENV_DIR/s3-stub.mjs" \
    --port "$port" --bucket "$bucket" --strict >> "$log" 2>&1 &

  # READINESS IS READ, NOT SLEPT THROUGH. The stub prints one line of JSON when
  # it is listening; a fixed sleep here is the flake that shows up as an upload
  # check failing once a fortnight with no explanation in the suite.
  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the object store never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# ── THE LANE'S MODEL, AND WHY IT IS OFF BY DEFAULT ───────────────────────────
#
#   lane_model_up  <k>   start lane k's model stub, wait for it to say ready
#   lane_model_env <k>   export the two variables that point the API at it
#
# THE SEAM IS THE SAME ONE STORAGE USED, and `model-stub.mjs` says so in its own
# header: `ai.service.ts` builds `new Anthropic({ apiKey })` and passes no
# `baseURL`, so the SDK fills it from `ANTHROPIC_BASE_URL`. No product change,
# exactly as `R2_ENDPOINT` needed none. What was missing was never a key; it was
# something to answer.
#
# GATED ON `RUNDESK_LANE_MODEL=1`, DELIBERATELY, AND THIS IS THE WHOLE POINT.
# FOUR suites assert the model refusal — 503 and the words "not configured" —
# and every one flips the day a lane can answer:
#
#     ai-create-containers   5 assertions
#     create-menu-ai         7
#     task-ai-bar            7
#     ai-answer-rendering    2
#
# That is 21, COUNTED INSIDE `chk(` CALLS rather than grepped for. A grep over
# whole files says six suites, because `ai-assign` and `clip-created-card` each
# carry a header sentence about the missing key and assert nothing about it —
# `clip-created-card`'s mentions are all about STORAGE. Overstating the cost of
# this work in the one comment somebody will read before starting it would be
# the same habit this audit spent a night finding in its own ledger.
#
# It is the defect class found twice in one night — a green that depended on
# the environment being broken — except known in advance.
#
# TWO OF THE FOUR CONVERT BY RE-AIMING, AND TWO DO NOT. That distinction was
# found by doing the work, and it is the reason this flag will never simply be
# switched on:
#
#   · `ai-create-containers` and `ai-answer-rendering` assert the refusal
#     INCIDENTALLY — they are about containers and about rendering, and the 503
#     is scenery. Both are converted: each check now asserts that the endpoint
#     AGREES with `/ai/status` rather than that it returns a particular code,
#     which is a stronger claim and holds in either environment. Both were run
#     both ways: 33 of 33 and 51 of 51, with a model and without.
#
#   · `create-menu-ai` and `task-ai-bar` are ABOUT the refusal. Their subject is
#     that a product with no key says "AI features are not configured" in words,
#     in the UI, in a toast. Arranging a provider failure through the stub does
#     NOT reproduce that: `assertAvailable` throws before any call is made, so
#     the arranged message would be the provider's and not the product's. With a
#     model configured the product correctly never says "not configured", and
#     these suites have nothing left to measure.
#
# AVAILABILITY IS PROCESS-LEVEL — one key per API — so a suite cannot choose.
# Turning this on for every lane would not break those two so much as EMPTY
# them. What they need is a lane without a model, which is what the per-lane
# shape of this flag already allows: `RUNDESK_LANE_MODEL=1` is read per lane at
# launch, so a fleet can run some lanes with a model and some without, and each
# suite goes to the lane whose configuration is its subject. Wiring that choice
# into the dispatcher is the next piece of this work and is NOT done.
#
# The two stale header sentences on `ai-assign` and `clip-created-card` were
# fixed at the same time; neither is a check, so neither blocks anything.
#
# Turning this on for every lane before that work is done would empty two green
# suites and redden nothing, which is worse than a gate that fails loudly.
#
# Lane k gets port 92<k>, beside storage on 91<k>.
lane_model_port () { echo $((9200 + $1)); }

# WHICH LANES GET A MODEL, AND IT IS A LIST BECAUSE IT HAS TO BE.
#
#   RUNDESK_LANE_MODEL=all     every lane
#   RUNDESK_LANE_MODEL="3 4"   those lanes, and no others
#   RUNDESK_LANE_MODEL=1       LANE ONE — a bare number is a list of one
#   unset                      no lane
#
# All-or-nothing was the first spelling and it cannot express what this work
# needs. `create-menu-ai` and `task-ai-bar` are ABOUT the product refusing for
# want of a key, so they need a lane WITHOUT one, while the suites that reach
# past the refusal need a lane with. One fleet, both configurations, chosen per
# lane — the same shape `fleet-up.sh` already takes for its lane list.
#
# A NOTE ON `=1`, because it changed meaning and silence would be a trap. It
# used to mean "on, everywhere"; it now means "lane 1". Every use of it so far
# was a single-lane verification on lane 1, so the effect is unchanged — but
# that is a coincidence, not a compatibility guarantee, and a script that meant
# "everywhere" must now say `all`.
lane_has_model () {
  local k="$1" want="${RUNDESK_LANE_MODEL:-}"
  [ -n "$want" ] || return 1
  [ "$want" = "all" ] && return 0
  local n
  for n in $want; do [ "$n" = "$k" ] && return 0; done
  return 1
}

lane_model_env () {
  local k="$1"
  lane_has_model "$k" || return 0
  export ANTHROPIC_BASE_URL="http://127.0.0.1:$(lane_model_port "$k")"
  # Any non-empty value: `ai.service.ts` only asks whether a key is SET before
  # building the client, and the stub authenticates nobody.
  export ANTHROPIC_API_KEY=stub-model-key
}

lane_model_up () {
  local k="$1"
  lane_has_model "$k" || return 0
  local port log
  port="$(lane_model_port "$k")"
  log="/tmp/claude-0/model-v$k.log"

  # Already listening for this lane — leave it, and leave its staging alone, for
  # the reason the store helper gives: a restart mid-run changes a suite's
  # second run from its first with nothing in the suite to explain it.
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/model-stub.mjs"; then
    return 0
  fi

  pkill -f "model-stub.mjs --port $port " 2>/dev/null
  : > "$log"
  RUNDESK_MODEL_STUB=1 nohup node "$LANE_ENV_DIR/model-stub.mjs" --port "$port" >> "$log" 2>&1 &

  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the model stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}
