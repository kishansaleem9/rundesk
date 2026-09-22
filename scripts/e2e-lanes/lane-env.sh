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

lane_store_up () {
  local k="$1"
  local port bucket log
  port="$(lane_store_port "$k")"
  bucket="$(lane_store_bucket "$k")"
  log="/tmp/claude-0/s3-v$k.log"

  # Already listening for this lane — leave it, and leave its objects alone.
  # A restart that emptied the bucket would make a suite's second run differ
  # from its first for a reason nothing in the suite mentions.
  if grep -q '"ready":true' "$log" 2>/dev/null &&
     curl -s --noproxy '*' -o /dev/null --max-time 2 "http://127.0.0.1:$port/$bucket/__probe"; then
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
