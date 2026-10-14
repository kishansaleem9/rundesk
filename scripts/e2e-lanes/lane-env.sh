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
#   lane_store_env <k>   export the four variables that point the API at it,
#                        and how long a clip's playback URL is signed for
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
  # A clip's link is signed again on every view, for an hour unless this says
  # otherwise. `clip-links` checks that the link still plays after the window
  # by waiting one out, so the lanes sign for ten seconds, and the store stub
  # refuses a URL past its window (`resume-defects/resume-7`). CI's API step
  # sets the same.
  export CLIP_PLAYBACK_URL_SECONDS=10
}

# A LANE'S INTEGRATION KEYS, WHICH ARE NOT REAL, AND WHICH PROVIDERS HAVE THEM.
#
#   lane_oauth_env <k>   export an OAuth client id and secret for Google,
#                        Microsoft and GitHub
#
# A grant's start refuses a provider this server holds no keys for
# (`oauth-start-answers-for-no-application`): it used to answer a consent
# address with `client_id=` empty, which the provider answers with an error
# page. The suites that read a grant's state — `personal-calendar-connect`,
# `app-catalogue`'s scopes, `permission-guards`' GitHub start — need a start
# that answers, so the lanes hold keys for the providers they start. Each
# provider refuses them at the code exchange, which is the failure path those
# suites follow already. Sign-in reads other names (`*_OAUTH_CLIENT_ID`), so no
# sign-in button appears. Zoom, Linear, GitLab, Salesforce and Dropbox stay
# keyless, so the refusal is measured on the same lanes (`oauth-start-readiness`,
# and `calendar-accounts`' Zoom row). CI's API step sets the same six.
lane_oauth_env () {
  export GOOGLE_CLIENT_ID=e2e-lane-google-client
  export GOOGLE_CLIENT_SECRET=e2e-lane-google-secret
  export MICROSOFT_CLIENT_ID=e2e-lane-microsoft-client
  export MICROSOFT_CLIENT_SECRET=e2e-lane-microsoft-secret
  export GITHUB_CLIENT_ID=e2e-lane-github-client
  export GITHUB_CLIENT_SECRET=e2e-lane-github-secret
}

# A LANE'S API TRUSTS ONE PROXY IN FRONT, AS PRODUCTION'S DOES
# (`found-30-sep/client-address-behind-nginx`).
#
#   lane_proxy_env <k>   export TRUST_PROXY=1, the value docker-compose.prod.yml
#                        runs the API with behind nginx
#
# A request with no X-Forwarded-For, which is every suite's but one, is read
# from its socket exactly as before: 127.0.0.1, or the other loopback address
# it chose. `auth-route-limits` stands a proxy of its own in front of the lane,
# appending the address it saw as nginx does, and reads that a client forging
# the header is still counted as the address the proxy saw, and that two
# clients behind it count apart. Without this the lane trusts no proxy and
# that half of the suite measures a different deployment from production's.
# CI's API step sets the same.
lane_proxy_env () {
  export TRUST_PROXY=1
}

# IS THE STUB ON <port> RUNNING THE SOURCE IN <file>? Both stubs report a hash
# of their own source at `/__control/version`; a stub from before a change, or
# one too old to have the route at all, answers something else and is
# restarted. Keeping a running stub is right — its state is the lane's — but
# only while it is the stub the tree describes.
stub_is_current () {
  # A stub made of more than one file names them all, in the order it hashes them.
  local port="$1" want
  shift
  want="$(cat "$@" | sha1sum | cut -c1-12)"
  curl -s --noproxy '*' --max-time 2 "http://127.0.0.1:$port/__control/version" 2>/dev/null |
    grep -q "\"source\":\"$want\""
}

# A STUB IS STOPPED BY ITS PORT, AND WAITED ON
# (`found-29-sep/stale-model-stub-never-replaced`). Both launchers ran
# `pkill -f "<stub>.mjs --port $port "`, with a space after the port. The store
# stub's command line goes on past its port (`--bucket …`), so that matched;
# the model stub's ends at the port, so it never did. A stale model stub was
# never stopped, its replacement died on EADDRINUSE, and the lane went on
# answering from the old source, the one `stub_is_current` was written to
# retire. The port is matched as a whole word now, and the call returns only
# once nothing answers on it.
stub_down () {
  local port="$1" file="$2"
  pkill -f "$(basename "$file") --port $port( |\$)" 2>/dev/null
  for _ in $(seq 1 50); do
    curl -s --noproxy '*' --max-time 1 -o /dev/null "http://127.0.0.1:$port/__control/version" 2>/dev/null || return 0
    sleep 0.1
  done
  return 1
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

  stub_down "$port" "$LANE_ENV_DIR/s3-stub.mjs"
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
# GATED ON `RUNDESK_LANE_MODEL`, WHICH NAMES THE LANES THAT GET ONE — `all`, or
# a list of lane numbers, and unset is none (`lane_has_model`, below) —
# DELIBERATELY, AND THIS IS THE WHOLE POINT. Counted on 23 September, FOUR
# suites asserted the model refusal — 503 and the words "not configured" — and
# every one would have flipped the day a lane could answer:
#
#     ai-create-containers   5 assertions
#     create-menu-ai         7
#     task-ai-bar            7
#     ai-answer-rendering    2
#
# That was 21, COUNTED INSIDE `chk(` CALLS rather than grepped for. A grep over
# whole files says six suites, because `ai-assign` and `clip-created-card` each
# carry a header sentence about the missing key and assert nothing about it —
# `clip-created-card`'s mentions are all about STORAGE. Overstating the cost of
# this work in the one comment somebody will read before starting it would be
# the same habit this audit spent a night finding in its own ledger.
#
# AND THE COUNT MISSED ONE. `ai-activity-filters` forces its failed run by
# asking for a task with no model and asserts the 503 without the words
# (`forced.status === 503`); its status checks count that failure. Two of the
# four have since been re-aimed (below), and on 29 September `ai-activity-filters`
# was too: it reads `/ai/status` and, on a model lane, stages a real provider
# failure through the stub (`suite-hygiene/ai-activity-filters-model-refusal`).
# So TWO suites stand on the refusal today: `create-menu-ai` and `task-ai-bar`.
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
# shape of this flag already allows: `RUNDESK_LANE_MODEL` is read per lane at
# launch, so a fleet can run some lanes with a model and some without, and each
# suite goes to the lane whose configuration is its subject. Half of that is
# wired: a break set whose patch says it needs a model gets one, and the
# runner's stamp re-syncs a lane whose model differs from what the set asked
# for (`patches_needing_model`, `lane_serving_id`, below). Routing a SUITE by
# its need — the dispatcher sending `create-menu-ai` and `task-ai-bar` only to
# a lane without one — is NOT done
# (`harness/model-lane-routing-unbuilt`).
#
# The two stale header sentences on `ai-assign` and `clip-created-card` were
# fixed at the same time; neither is a check, so neither blocks anything.
#
# Turning this on for every lane before that work is done would take the
# refusal away from the two suites that stand on it, and their checks would
# fail over the lane rather than the product — which is worse than a gate that
# fails loudly, because it reads as a regression.
#
# Lane k gets port 92<k>, beside storage on 91<k>.
lane_model_port () { echo $((9200 + $1)); }

# WHAT PROVES A LANE'S DATABASE IS CURRENT: the newest migration that leaves
# something to look for, as `<file> <table> [<column>]`. A column it adds
# (`ALTER TABLE "t" ADD COLUMN IF NOT EXISTS "c"`), or a table it creates
# (`CREATE TABLE IF NOT EXISTS "t"`). The restart script looked for columns
# only, so a migration that creates a table (0162, `outbound_email_messages`)
# left the check on an older column, and a lane without the table passed it and
# then 500'd on its first write to it. A data-only migration names nothing to
# look for and is walked past. Prints nothing when no migration does.
newest_schema_witness () {
  local dir="$1" f pair created
  for f in $(ls "$dir"/*.sql 2>/dev/null | sort -r); do
    # The column AND ITS TABLE: the ALTER TABLE it is added under, on its own
    # line or on one before it (older migrations split the statement). This
    # paired the file's first column with the file's first ALTER TABLE, which
    # can be another table's constraint, and 0186's was — the witness read
    # `email_accounts.account_id`, a column on `task_comment_emails`, and
    # refused a lane whose schema was whole (found-12-oct/schema-witness-pairs-another-table).
    pair=$(awk '{ l = tolower($0) }
      match(l, /alter table "[a-z0-9_]+"/) { t = substr(l, RSTART + 13, RLENGTH - 14) }
      match(l, /add column if not exists "[a-z0-9_]+"/) { if (t != "") { print t, substr(l, RSTART + 26, RLENGTH - 27); exit } }' "$f")
    if [ -n "$pair" ]; then echo "$f $pair"; return 0; fi
    created=$(grep -oiE 'CREATE TABLE IF NOT EXISTS "[a-z0-9_]+"' "$f" | head -1 | grep -oE '"[a-z0-9_]+"' | tr -d '"')
    if [ -n "$created" ]; then echo "$f $created"; return 0; fi
  done
  return 0
}

# A LANE LIST, IN THE ONE SPELLING EVERY SCRIPT TAKES: "9" is lane nine, "9 10"
# is lanes nine and ten, and a range is spelled with `seq`. `fleet-up.sh` read a
# bare number as a COUNT, and it drops and restores the database of every lane
# it is given, so `sweep-until-clean.sh`, healing one down lane with
# `fleet-up.sh "3"`, would have dropped lanes 1 and 2 with it
# (`commit-log/log-8ac33d9-1`). `fleet-restart.sh` had made the same mistake
# and fixed it for itself; this is its rule, for both. Prints the lanes one per
# line; anything that is not a lane from 1 to 10 is refused with exit 2.
lane_list () {
  local k out=()
  for k in $*; do
    case "$k" in
      ''|*[!0-9]*) echo "not a lane number: '$k'" >&2; return 2 ;;
    esac
    if [ "$k" -lt 1 ] || [ "$k" -gt 10 ]; then echo "lane out of range: $k" >&2; return 2; fi
    out+=("$k")
  done
  [ ${#out[@]} -gt 0 ] || { echo "no lanes given" >&2; return 2; }
  printf '%s\n' "${out[@]}"
}

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

# A PATCH'S NAME, AS THE BREAK RUNNER READS IT: `sa-1-x`, `sa-1-x.py` and
# `test/e2e/breaks/sa-1-x.py` are one patch. The runner's loop always took all
# three, but the header readers below looked for `$dir/$p.py` as given, so a set
# named by its files (`ls breaks/ | grep ...`) found no header: `super-agents`'s
# 38 patches, every one saying it reddens only where a model answers, started
# on a lane with none (`found-13-oct/break-set-named-by-file-runs-without-its-model`).
patch_stem () {
  local p="${1##*/}"
  printf '%s\n' "${p%.py}"
}

# A PATCH THAT CAN REDDEN ONLY WHERE A MODEL ANSWERS says so in its header,
#
#     # Reddens only where a model answers: run it on a lane with ...
#
# and the break runner asks it of every patch in a set (`wt-break.sh`), so the
# set runs with a model — its baseline too, or the two would measure different
# configurations. It used to be up to whoever started the run: the second
# drifted plan ran `wra-11` and `wra-12` on lanes 3 and 4 with none, the suite
# built no prompt, and both read as patches that reddened nothing
# (`found-24-sep/model-patches-measured-without-a-model`). Prints the names
# that need one, one per line; a patch that is not there needs nothing.
patches_needing_model () {
  local dir="$1" p
  shift
  for p in "$@"; do
    p=$(patch_stem "$p")
    grep -q '^# Reddens only where a model answers' "$dir/$p.py" 2>/dev/null && echo "$p"
  done
  return 0
}

# AND THE OTHER WAY ROUND: a patch aimed at the assistant's refusal ("AI
# features are not configured") changes nothing where a model answers, so it
# says `# Reddens only where no model answers`. One set holding both kinds
# cannot be measured on one lane: the runner gave it the model for the one that
# needed it, and `bep-7`, `bep-13` and `bep-14` read as reddening nothing
# (`found-29-sep/no-model-patches-run-with-a-model`).
patches_needing_no_model () {
  local dir="$1" p
  shift
  for p in "$@"; do
    p=$(patch_stem "$p")
    grep -q '^# Reddens only where no model answers' "$dir/$p.py" 2>/dev/null && echo "$p"
  done
  return 0
}

# WHAT A SUITE NEEDS OF A LANE'S MODEL, from its header (`harness/model-lane-routing-unbuilt`):
#
#     // Lane: no-model — it asserts the assistant's "not configured" answer
#     // Lane: model — it stages the stub's answers
#
# A suite that stands on the refusal cannot pass where a model answers, and one
# that stages the stub cannot pass where none does; a lane with the wrong one is
# refused by `verify.sh` and re-synced by the break runner. Prints no-model,
# model, or any.
suite_lane_need () {
  local need
  need=$(grep -m1 -oE '^// Lane: (no-model|model)\b' "$1" 2>/dev/null | sed 's#^// Lane: ##')
  echo "${need:-any}"
}

# The refusal a suite's need and a lane's answer make, or nothing when they
# agree: `lane_need_refusal <need> <yes|no|unknown>`. Unknown refuses nothing:
# a lane that cannot say is not assumed either way.
lane_need_refusal () {
  local need="$1" has="$2"
  if [ "$need" = "no-model" ] && [ "$has" = "yes" ]; then
    echo "it stands on the assistant's refusal, and this lane's API has a model"
  elif [ "$need" = "model" ] && [ "$has" = "no" ]; then
    echo "it needs a model's answers, and this lane's API has none"
  fi
}

# Whether the API on <port> answers with a model: yes, no, or unknown. Asked of
# the running API (`/ai/status`, signed in as the lane's admin), not of
# `RUNDESK_LANE_MODEL`, which says what the launcher meant rather than what runs.
lane_api_has_model () {
  local port="$1" token body
  token=$(curl -s --max-time 10 -H 'content-type: application/json' \
    -d "{\"email\":\"${E2E_EMAIL:-admin@rundesk.internal}\",\"password\":\"${E2E_PASSWORD:-Admin@123!}\"}" \
    "http://127.0.0.1:$port/api/v1/auth/login" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
  [ -n "$token" ] || { echo unknown; return 0; }
  body=$(curl -s --max-time 10 -H "authorization: Bearer $token" "http://127.0.0.1:$port/api/v1/ai/status")
  case "$body" in
    *'"available":true'*) echo yes ;;
    *'"available":false'*) echo no ;;
    *) echo unknown ;;
  esac
}

# This lane, taken out of the lanes with a model, for this process and its
# children: the break runner's answer to a suite that needs none.
lane_model_remove () {
  local k="$1" out="" n all
  lane_has_model "$k" || return 0
  all="${RUNDESK_LANE_MODEL:-}"
  [ "$all" = "all" ] && all="1 2 3 4 5 6 7 8 9 10"
  for n in $all; do [ "$n" = "$k" ] || out="$out $n"; done
  export RUNDESK_LANE_MODEL="${out# }"
}

# This lane, added to the lanes with a model, for this process and its children.
lane_model_add () {
  local k="$1"
  lane_has_model "$k" && return 0
  export RUNDESK_LANE_MODEL="${RUNDESK_LANE_MODEL:+$RUNDESK_LANE_MODEL }$k"
}

# WHAT A LANE IS SERVING, for the break runner's stamp: the revision, and
# whether the API was started with a model. A lane serving the right revision
# WITHOUT one is not serving what a set that needs one asked for, and the
# revision alone could not tell the two apart. And with a search index, for the
# same reason (`patches_needing_search`).
lane_serving_id () {
  local rev="$1" k="$2"
  lane_has_search "$k" && rev="$rev +search"
  if lane_has_model "$k"; then echo "$rev +model"; else echo "$rev"; fi
}

lane_model_env () {
  local k="$1"
  lane_has_model "$k" || return 0
  export ANTHROPIC_BASE_URL="http://127.0.0.1:$(lane_model_port "$k")"
  # Any non-empty value: `ai.service.ts` only asks whether a key is SET before
  # building the client, and the stub authenticates nobody.
  export ANTHROPIC_API_KEY=stub-model-key
  # AI fields that fill and update themselves (`ledger-rows/row-719`) wait as
  # ClickUp's do — twenty minutes between an edit and its refresh — which no
  # suite can sit through; a lane with a model waits seconds.
  export AI_FIELD_AUTOFILL_SECONDS=1
  export AI_FIELD_REFRESH_SECONDS=3
  # The lanes' admin asks the model in every suite that needs one, and a break
  # set runs one suite thirty-odd times an hour. The product's cap of 200 AI
  # calls an hour for one person (`AI_HOURLY_LIMIT`) was met mid-set, and every
  # run after it read the cap, not its patch, until the hour drained
  # (`found-13-oct/lane-admin-meets-the-hourly-ai-cap`). A lane's admin is not a
  # person; the refusal itself is held by `chat-trace.test.ts`.
  export AI_HOURLY_LIMIT=100000
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

  stub_down "$port" "$LANE_ENV_DIR/model-stub.mjs"
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

# ── THE LANE'S SEARCH ENGINE, AND WHY IT IS OFF BY DEFAULT ──────────────────
#
#   lane_search_up    <k>   start lane k's Meilisearch stub, wait for it to say ready
#   lane_search_env   <k>   export the two variables that point the API at it
#   lane_search_ready <k>   after the API is up: it searches through that stub
#
# THE SAME SEAM A THIRD TIME (`commit-log/log-68c0345-1`). `SearchService`
# builds `new MeiliSearch({ host, apiKey })` from MEILISEARCH_URL and
# MEILISEARCH_MASTER_KEY when the first is set, and searches Postgres when it
# is not. No lane set it, so the indexers — `indexTask`, `indexDoc`, the file
# indexer, `removeTask`, the workspace rebuild — ran nowhere, and `doc-import`
# recorded indexing as unmeasurable. `meili-stub.mjs` is something to talk to;
# `check-meili-stub.mjs` drives the real service and client against it.
#
# GATED ON `RUNDESK_LANE_SEARCH`, in `RUNDESK_LANE_MODEL`'s spellings — `all`, a
# list of lane numbers, unset for none (`lane_has_search`). Off by default
# because it is a different path, not a better one: where it is on, a plain
# search reads tasks, docs and files from the index alone, so a row written
# without the API (a suite planting an attachment by SQL) is not found there,
# and a break patch aimed at the Postgres query reddens nothing. The suites that
# read the index ask which engine answered (`test/e2e/lib/search.mjs`) and hold
# either way; a patch that reddens only through the index says so in its header
# (`patches_needing_search`) and gets a lane with one.
#
# THE MAIN TREE'S `.env` NAMES A MEILISEARCH NOTHING RUNS. A lane started from
# /home/user/rundesk reads `../../.env`, which sets
# MEILISEARCH_URL=http://localhost:7700, so its init fails ("Meilisearch init
# failed: fetch failed") and it falls back; one started from a worktree has no
# `.env` and logs "MEILISEARCH_URL not set". The database answers either way,
# and what is exported here wins over the file.
#
# THE INDEX IS IN THE STUB'S MEMORY AND THE API MAKES IT ONCE, AT BOOT. A stub
# restarted under a running API leaves it searching an index that no longer
# exists — a 404 from the stub, a 500 from every search — so the stub is started
# here, before its API, and nowhere else: a sweep that finds one dead or stale
# restarts the lane (`sweep-until-clean.sh`). A running stub that is current is
# kept, with its documents, for the reason the store keeps its objects.
#
# Lane k gets port 93<k>, beside the model on 92<k>, and a master key of its
# own, which the stub enforces as Meilisearch does: an API pointed at another
# lane's stub is refused rather than served.
lane_search_port () { echo $((9300 + $1)); }
lane_search_key () { echo "stub-search-key-v$1"; }

lane_has_search () {
  local k="$1" want="${RUNDESK_LANE_SEARCH:-}" n
  [ -n "$want" ] || return 1
  [ "$want" = "all" ] && return 0
  for n in $want; do [ "$n" = "$k" ] && return 0; done
  return 1
}

# This lane, added to the lanes with search, for this process and its children:
# the break runner's answer to a set with a patch that needs the index.
lane_search_add () {
  local k="$1"
  lane_has_search "$k" && return 0
  export RUNDESK_LANE_SEARCH="${RUNDESK_LANE_SEARCH:+$RUNDESK_LANE_SEARCH }$k"
}

# A PATCH THAT CAN REDDEN ONLY WHERE MEILISEARCH ANSWERS says so in its header,
#
#     # Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# The model's rule (`patches_needing_model`), for the index: the indexers write
# to nothing else, so a patch that stops `indexTask` changes nothing a suite can
# see on a lane without one and would read as reddening nothing. Prints the
# names that need one, one per line.
patches_needing_search () {
  local dir="$1" p
  shift
  for p in "$@"; do
    p=$(patch_stem "$p")
    grep -q '^# Reddens only where Meilisearch answers' "$dir/$p.py" 2>/dev/null && echo "$p"
  done
  return 0
}

lane_search_env () {
  local k="$1"
  lane_has_search "$k" || return 0
  export MEILISEARCH_URL="http://127.0.0.1:$(lane_search_port "$k")"
  export MEILISEARCH_MASTER_KEY="$(lane_search_key "$k")"
}

lane_search_up () {
  local k="$1"
  lane_has_search "$k" || return 0
  local port log
  port="$(lane_search_port "$k")"
  log="/tmp/claude-0/meili-v$k.log"

  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/meili-stub.mjs"; then
    return 0
  fi

  stub_down "$port" "$LANE_ENV_DIR/meili-stub.mjs"
  : > "$log"
  RUNDESK_MEILI_STUB=1 nohup node "$LANE_ENV_DIR/meili-stub.mjs" --port "$port" --key "$(lane_search_key "$k")" >> "$log" 2>&1 &

  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the search stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# AN API THAT ANSWERS HEALTH IS NOT ONE THAT SEARCHES THROUGH ITS STUB. Its
# init can fail — a wrong key, a stub that died — and it then falls back to
# Postgres in silence, so a lane reported UP would measure the path it was
# started to leave. The API logs the connection before it listens, so by the
# time health answers the line is there or it never will be. 0 for a lane
# without search. LANE_LOG_DIR moves the log it reads, for a self-check.
lane_search_ready () {
  local k="$1"
  lane_has_search "$k" || return 0
  grep -a -q "Meilisearch connected at http://127.0.0.1:$(lane_search_port "$k")" "${LANE_LOG_DIR:-/tmp/claude-0}/api-v$k.log" 2>/dev/null
}

# ── THE LANE'S CALENDARS ───────────────────────────────────────────────────
#
#   lane_calendar_up  <k>   start lane k's calendar stub, wait for it to say ready
#   lane_calendar_env <k>   export the variables that point the API at it
#
# A PERSON'S CONNECTED CALENDARS ARE READ AND WRITTEN
# (`found-25-sep/connected-calendars-read-by-nothing`): the planner draws their
# events, "Upcoming" lists them, and a block is written to the default one. The
# addresses are Google's and Microsoft's unless these say otherwise, and no lane
# reaches either, so every lane points them at `calendar-stub.mjs`, the token
# addresses too, so an expired token is refreshed there.
#
# ON FOR EVERY LANE, unlike search: without it a connected calendar is not a
# different path but an unreachable one. And it holds nothing a suite did not
# put there — a calendar is a bearer token, seeded by the suite that made the
# account — so no suite's calendars reach another's.
#
# Lane k gets port 94<k>, beside search on 93<k>.
lane_calendar_port () { echo $((9400 + $1)); }

lane_calendar_env () {
  local base
  base="http://127.0.0.1:$(lane_calendar_port "$1")"
  export GOOGLE_CALENDAR_API_URL="$base/google/calendar/v3"
  export MS_GRAPH_API_URL="$base/graph/v1.0"
  export GOOGLE_TOKEN_URL="$base/google/token"
  export MICROSOFT_TOKEN_URL="$base/microsoft/token"
  # And search's three federated sources, which the same stub answers
  # (`found-23-sep/connected-search-per-person`).
  export GOOGLE_DRIVE_API_URL="$base/google/drive/v3"
  export GMAIL_API_URL="$base/gmail/v1"
  export MICROSOFT_GRAPH_API_URL="$base/graph/v1.0"
  # And Google's profile, read when a connection is made, so a connect completes here.
  export GOOGLE_USERINFO_URL="$base/google/userinfo"
  # And Basecamp, signed in to for its import (`commit-log/log-601eacc-2`): Launchpad and the
  # account API both here, the API's origin the only one the importer follows. An application
  # needs no keys at the stub, only names.
  export BASECAMP_LAUNCHPAD_URL="$base/basecamp/launchpad"
  export BASECAMP_API_ORIGIN="$base"
  export BASECAMP_CLIENT_ID="${BASECAMP_CLIENT_ID:-stub-basecamp}"
  export BASECAMP_CLIENT_SECRET="${BASECAMP_CLIENT_SECRET:-stub-basecamp-secret}"
  # And Asana, Jira, Trello, Todoist, Wrike and Monday, signed in to for theirs
  # (`found-13-oct/importers-by-sign-in-unbuilt`): each tool's sign-in and API here,
  # under its own path (`import-apps-stub.mjs`), the only addresses its importer asks.
  export ASANA_AUTH_URL="$base/asana/-/oauth_authorize" ASANA_TOKEN_URL="$base/asana/-/oauth_token" ASANA_API_URL="$base/asana/api/1.0"
  export ASANA_CLIENT_ID="${ASANA_CLIENT_ID:-stub-asana}" ASANA_CLIENT_SECRET="${ASANA_CLIENT_SECRET:-stub-asana-secret}"
  export ATLASSIAN_AUTH_URL="$base/atlassian/auth" ATLASSIAN_API_URL="$base/atlassian/api"
  export JIRA_CLIENT_ID="${JIRA_CLIENT_ID:-stub-jira}" JIRA_CLIENT_SECRET="${JIRA_CLIENT_SECRET:-stub-jira-secret}"
  export TRELLO_AUTHORIZE_URL="$base/trello/1/authorize" TRELLO_API_URL="$base/trello/1" TRELLO_FILE_ORIGIN="$base"
  export TRELLO_API_KEY="${TRELLO_API_KEY:-stub-trello}"
  export TODOIST_AUTH_URL="$base/todoist/oauth/authorize" TODOIST_TOKEN_URL="$base/todoist/oauth/access_token" TODOIST_API_URL="$base/todoist/api/v1"
  export TODOIST_CLIENT_ID="${TODOIST_CLIENT_ID:-stub-todoist}" TODOIST_CLIENT_SECRET="${TODOIST_CLIENT_SECRET:-stub-todoist-secret}"
  export WRIKE_AUTH_URL="$base/wrike/oauth2/authorize/v4" WRIKE_TOKEN_URL="$base/wrike/oauth2/token" WRIKE_API_URL="$base/wrike/api/v4"
  export WRIKE_CLIENT_ID="${WRIKE_CLIENT_ID:-stub-wrike}" WRIKE_CLIENT_SECRET="${WRIKE_CLIENT_SECRET:-stub-wrike-secret}"
  export MONDAY_API_URL="$base/monday/v2"
  # And ClickUp, a whole Workspace by its token (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
  export CLICKUP_API_URL="$base/clickup/api/v2"
}

lane_calendar_up () {
  local k="$1" port log
  port="$(lane_calendar_port "$k")"
  log="/tmp/claude-0/calendar-v$k.log"
  # A running stub that is current is kept, and its calendars with it, for the
  # reason the store keeps its objects.
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/calendar-stub.mjs" "$LANE_ENV_DIR/import-apps-stub.mjs"; then
    return 0
  fi
  stub_down "$port" "$LANE_ENV_DIR/calendar-stub.mjs"
  : > "$log"
  RUNDESK_CALENDAR_STUB=1 nohup node "$LANE_ENV_DIR/calendar-stub.mjs" --port "$port" >> "$log" 2>&1 &
  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the calendar stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# ── THE LANE'S PHOTO LIBRARY ────────────────────────────────────────────────
#
#   lane_media_up  <k>   start lane k's media stub, wait for it to say ready
#   lane_media_env <k>   export the variables that point the API at it
#
# A COVER'S SEARCH TAB SEARCHES A STOCK PHOTO LIBRARY (`commit-log/log-601eacc-1`):
# Unsplash's, at UNSPLASH_API_URL with UNSPLASH_ACCESS_KEY. And the AI's images
# (`ledger-rows/row-870`) are made by OpenAI's images API, at IMAGES_API_URL with
# IMAGES_API_KEY, which the same stub answers. No lane reaches
# Unsplash, so every lane points it at `media-stub.mjs`, whose library is the
# same fixed set of photos everywhere. On for every lane, as the calendars are:
# without it the tab says photo search is not set up, a different page.
#
# Lane k gets port 95<k>, beside the calendars on 94<k>.
lane_media_port () { echo $((9500 + $1)); }

lane_media_env () {
  export UNSPLASH_API_URL="http://127.0.0.1:$(lane_media_port "$1")/unsplash"
  export UNSPLASH_ACCESS_KEY="lane-photos"
  # And images made to order (`ledger-rows/row-870`): OpenAI's images shape, from the same stub.
  export IMAGES_API_URL="http://127.0.0.1:$(lane_media_port "$1")/openai/v1"
  export IMAGES_API_KEY="lane-images"
  # And ChatGPT in Brain's picker (`commit-log/log-39863ff-1`): OpenAI's chat shape, from the same stub.
  # No Gemini key, so the picker's "not set up" row is drawn and refused on every lane, as in CI.
  export CHATGPT_API_URL="http://127.0.0.1:$(lane_media_port "$1")/openai/v1"
  export CHATGPT_API_KEY="lane-chatgpt"
  # And the AI Notetaker's meeting bot (`commit-log/log-39863ff-1`): Recall.ai's shapes, from the same
  # stub. It looks every two seconds rather than every minute, so a suite sees a bot move as it moves.
  export RECALL_API_URL="http://127.0.0.1:$(lane_media_port "$1")/recall"
  export RECALL_API_KEY="lane-recall"
  export NOTETAKER_POLL_SECONDS=2
  # And a map's geocoder and tiles (`ledger-rows/row-777`): OpenStreetMap's shapes, from the same stub.
  export GEOCODER_URL="http://127.0.0.1:$(lane_media_port "$1")/geocode"
  export MAP_TILES_URL="http://127.0.0.1:$(lane_media_port "$1")/tiles/{z}/{x}/{y}.svg"
}

lane_media_up () {
  local k="$1" port log
  port="$(lane_media_port "$k")"
  log="/tmp/claude-0/media-v$k.log"
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/media-stub.mjs"; then
    return 0
  fi
  stub_down "$port" "$LANE_ENV_DIR/media-stub.mjs"
  : > "$log"
  RUNDESK_MEDIA_STUB=1 nohup node "$LANE_ENV_DIR/media-stub.mjs" --port "$port" >> "$log" 2>&1 &
  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the media stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# ── THE LANE'S MAIL SERVER ──────────────────────────────────────────────────
#
#   lane_mail_up  <k>   start lane k's mail stub, wait for it to say ready
#   lane_mail_env <k>   export the variables that point the API at it
#
# A TASK'S COMMENT BOX SENDS EMAIL (`resume-defects/s4-composer-email`), through
# the server's SMTP — `EmailService`, which needs SMTP_HOST, SMTP_USER and
# SMTP_PASS to send at all. No lane reaches a mail server, so every lane points
# the API at `mail-stub.mjs`, which takes every message, and a suite reads back
# what went. So every mail the API sends on a lane is taken there — a
# notification's, an invitation's — where before it was a line in the API's
# log. On for every lane, as the calendars are: without it the comment box says
# the server has no mail set up, a different page.
#
# Lane k's SMTP is on port 96<k>, beside the photo library on 95<k>, and the
# stub's control seam — the port its version is asked on — on 97<k>.
lane_mail_port () { echo $((9600 + $1)); }
lane_mail_control_port () { echo $((9700 + $1)); }
# And the mailbox a person links over IMAP (`mailbox-stub.mjs`, `found-12-oct/task-email-imap-unbuilt`):
# its IMAP on 98<k>, its SMTP on 98<k+50>, its control seam on 99<k>, its certificate in /tmp.
lane_mailbox_port () { echo $((9800 + $1)); }
lane_mailbox_smtp_port () { echo $((9850 + $1)); }
lane_mailbox_control_port () { echo $((9900 + $1)); }
lane_mailbox_tls_dir () { echo "/tmp/claude-0/mailbox-tls-v$1"; }

lane_mail_env () {
  export SMTP_HOST=127.0.0.1
  export SMTP_PORT="$(lane_mail_port "$1")"
  export SMTP_USER=lane-mail
  export SMTP_PASS=lane-mail-key
  export SMTP_SECURE=false
  # A task's email from a linked mailbox (`found-9-oct/task-email-sends-from-the-server`):
  # its answers are read back every two minutes and one set for later is sent
  # within thirty seconds; a lane does both in seconds, so a suite can wait them out.
  export EMAIL_REPLY_POLL_SECONDS=2
  export TASK_EMAIL_SCHEDULE_SECONDS=1
  # A mailbox linked over IMAP (`found-12-oct/task-email-imap-unbuilt`): its servers are
  # typed by whoever links it, and the API reaches none on a private address unless the
  # operator names it — a lane names its own mailbox stub — and trusts that stub's
  # certificate for STARTTLS. Its password is kept sealed, so a lane has a key to seal it
  # with: the same on every lane, and nobody's secret (a lane's mailboxes are made up).
  export MAILBOX_PRIVATE_SERVERS="127.0.0.1:$(lane_mailbox_port "$1") 127.0.0.1:$(lane_mailbox_smtp_port "$1")"
  export MAILBOX_TLS_CA_FILE="$(lane_mailbox_tls_dir "$1")/cert.pem"
  export TOKEN_ENCRYPTION_KEY=6c616e652d6b65792d6e6f742d612d7365637265742d72756e6465736b2d3031
}

lane_mail_up () {
  local k="$1" port log
  port="$(lane_mail_control_port "$k")"
  log="/tmp/claude-0/mail-v$k.log"
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/mail-stub.mjs"; then
    lane_mailbox_up "$k"
    return
  fi
  stub_down "$port" "$LANE_ENV_DIR/mail-stub.mjs"
  : > "$log"
  RUNDESK_MAIL_STUB=1 nohup node "$LANE_ENV_DIR/mail-stub.mjs" --port "$port" --smtp-port "$(lane_mail_port "$k")" >> "$log" 2>&1 &
  for _ in $(seq 1 50); do
    if grep -q '"ready":true' "$log" 2>/dev/null; then
      lane_mailbox_up "$k"
      return
    fi
    sleep 0.2
  done
  echo "lane $k: the mail stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# The mailbox stub starts with the mail stub, so every launcher that brings a
# lane's mail up brings this up too.
lane_mailbox_up () {
  local k="$1" port log
  port="$(lane_mailbox_control_port "$k")"
  log="/tmp/claude-0/mailbox-v$k.log"
  if grep -q '"ready":true' "$log" 2>/dev/null && stub_is_current "$port" "$LANE_ENV_DIR/mailbox-stub.mjs"; then
    return 0
  fi
  stub_down "$port" "$LANE_ENV_DIR/mailbox-stub.mjs"
  : > "$log"
  RUNDESK_MAILBOX_STUB=1 nohup node "$LANE_ENV_DIR/mailbox-stub.mjs" --port "$port" --imap-port "$(lane_mailbox_port "$k")" \
    --smtp-port "$(lane_mailbox_smtp_port "$k")" --tls-dir "$(lane_mailbox_tls_dir "$k")" >> "$log" 2>&1 &
  for _ in $(seq 1 50); do
    grep -q '"ready":true' "$log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "lane $k: the mailbox stub never announced itself on $port" >&2
  tail -3 "$log" 2>/dev/null >&2
  return 1
}

# ── STOP A LANE'S API, AND WAIT UNTIL IT HAS GONE ──────────────────────────
#
# `lane_api_down <port>`. Every script that starts a lane's API has to stop the
# old one first, and two of them did not wait for it to stop — one did not stop
# it at all:
#
#   - `fleet-up.sh` ran `pkill -f "PORTMARK=$k "`. PORTMARK is an environment
#     variable, not part of any command line, so that pattern matched nothing
#     (`wt-break.sh` found this first and says so). The old API kept the port,
#     the new one failed to bind, and the health loop reported the OLD process
#     as the lane coming UP — old code, reported as fresh.
#   - `fleet-restart.sh` killed by port and relaunched at once. A process asked
#     to exit still answers health for a moment, so the same health loop could
#     pass against the dying process while the new one lost the port.
#
# By port, then waited on until nothing listens there; anything still holding
# it after twenty seconds (LANE_API_DOWN_GRACE) is killed outright. Returns 1 if
# the port is still held after that, so the caller can say so instead of
# starting a second API that cannot bind. `scripts/check-lane-api-down.sh`
# holds it to that, and proves it can tell when it does not.
lane_api_down () {
  local port="$1" pids left
  # THE BREAK RUNNER'S STAMP GOES FIRST, whether or not anything is listening.
  # `wt-break.sh` trusts `/tmp/claude-0/wt<lane>.serving` to name the commit
  # whose unpatched WORKTREE build the lane serves, and skips its sync when that
  # matches HEAD. Every caller of this function goes on to start the MAIN
  # tree's build on the port, and left the stamp claiming the worktree's: on
  # 24 September lanes 2 to 4 were stamped `aa239bc` while serving a main-tree
  # build with uncommitted work in it, so a break run at that commit would have
  # measured its baseline against that. (`wt-break.sh` stops its own API
  # without this function, and rewrites the stamp once its restart is up.)
  rm -f "/tmp/claude-0/wt$((port - 3020)).serving"
  pids=$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null | sort -u)
  [ -z "$pids" ] && return 0
  kill $pids 2>/dev/null
  for _ in $(seq 1 "${LANE_API_DOWN_GRACE:-20}"); do
    [ -z "$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null)" ] && return 0
    sleep 1
  done
  left=$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null | sort -u)
  [ -n "$left" ] && kill -9 $left 2>/dev/null
  for _ in $(seq 1 5); do
    [ -z "$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null)" ] && return 0
    sleep 1
  done
  echo "port $port is still held after SIGKILL — not starting a second API on it" >&2
  return 1
}

# ── LOCKS THAT SAY WHO HOLDS THEM ───────────────────────────────────────────
#
# `run-plan.sh` and `wt-break.sh` lock with `mkdir`, and released only in an
# EXIT trap — which a SIGKILL skips, and processes here are reaped mid-round
# (`sweep-until-clean.sh`'s header records it). A reaped holder left its
# directory behind with nothing in it to say whose it was, and every waiter
# then waited for ever, silently: `chain-plan` on the dispatcher's lock, and
# `run-plan` skipping a locked lane on every pass.
#
# So a lock carries its holder's PID, and is HELD only while that process is
# alive. One with no PID yet is either an old-style lock or one taken this
# instant and not yet signed: held for its first minute, stale after that.
#
#   lock_take <dir>   0 when this shell now holds it; says so when it had to
#                     clear a stale one first
#   lock_held <dir>   0 when a live process holds it
#   lock_drop <dir>   release (the directory holds the PID file, so not rmdir)
lock_held () {
  local dir="$1" pid age
  [ -d "$dir" ] || return 1
  pid=$(cat "$dir/pid" 2>/dev/null)
  if [ -z "$pid" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$dir" 2>/dev/null || echo 0) ))
    [ "$age" -lt "${LOCK_UNSIGNED_GRACE:-60}" ]
    return
  fi
  kill -0 "$pid" 2>/dev/null
}

lock_take () {
  local dir="$1" holder
  if mkdir "$dir" 2>/dev/null; then
    echo "$$" > "$dir/pid"
    return 0
  fi
  lock_held "$dir" && return 1
  holder=$(cat "$dir/pid" 2>/dev/null)
  echo "stale lock $dir from ${holder:+PID $holder}${holder:-an unsigned holder}, which is gone — taking it" >&2
  rm -rf "$dir"
  # Atomic: of two shells clearing the same stale lock, one mkdir wins.
  mkdir "$dir" 2>/dev/null || return 1
  echo "$$" > "$dir/pid"
}

lock_drop () { rm -rf "$1"; }

# ── A BREAK RUN HOLDS ITS LANE AND ITS SUITE ────────────────────────────────
#
#   break_locks_take <lane> <suite>   0 when this shell now holds both; 3 when
#                                     either is held by a live run — holding
#                                     neither, and saying which
#   break_locks_drop <lane> <suite>
#
# The lane lock alone let two sets of ONE suite run at once on two lanes, and a
# set's results go to `break-<suite>.txt`, one file per SUITE: the second run
# truncated the first's results mid-run, and both archived the mixture
# (`found-24-sep/one-suite-two-lanes-share-a-results-file`). The suite lock is
# taken after the lane's and given back with it, so a refusal of either leaves
# the other run and its file alone. BREAK_LOCK_DIR moves both for a self-check.
break_locks_take () {
  local lane="$1" suite="$2" dir="${BREAK_LOCK_DIR:-/tmp/claude-0}"
  if ! lock_take "$dir/wt$lane.lock"; then
    echo "lane $lane is already break-testing (PID $(cat "$dir/wt$lane.lock/pid" 2>/dev/null || echo 'unsigned')) — refusing to interleave" >&2
    return 3
  fi
  if ! lock_take "$dir/break-$suite.lock"; then
    echo "$suite is already being break-tested (PID $(cat "$dir/break-$suite.lock/pid" 2>/dev/null || echo 'unsigned')) — refusing to share its results file" >&2
    lock_drop "$dir/wt$lane.lock"
    return 3
  fi
}
break_locks_drop () {
  local dir="${BREAK_LOCK_DIR:-/tmp/claude-0}"
  lock_drop "$dir/break-$2.lock"
  lock_drop "$dir/wt$1.lock"
}

# ── A LANE'S DATABASE HAS THE SCHEMA THE SOURCE SAYS ────────────────────────
#
#   schema_describe <db>      one sorted line per column (type, nullability,
#                             default), index, constraint and enum
#   schema_ref_ensure         the reference database is current; 1 if it
#                             could not be built
#   lane_schema_drift <db>    nothing and 0 when <db> matches the reference;
#                             `missing: …` / `extra: …` lines and 1 when it
#                             does not; 2 when there is no reference to ask
#
# Lanes 2 to 4 lacked four unique indexes and a dropped default, and lanes 6 to
# 10 two migrations, while every run on them reported on "the product"
# (`found-25-sep/lane-databases-drift-from-the-migrations`). The newest
# migration's column or table — `newest_schema_witness` — says nothing of an
# index, a default or a constraint.
#
# THE REFERENCE is the pristine dump every lane is restored from, with the
# CURRENT schema source pushed onto it — exactly what `fleet-sync.sh` does to a
# lane, and what CI builds its database with. Not the pristine database itself:
# on 28 September it was the one behind (0164's default), with lanes 6 to 10
# beside it. The reference is rebuilt when the schema source or the migrations
# change, keyed by their hash, under a lock.
#
# IT IS THE CALLING CHECKOUT'S (`found-30-sep/schema-reference-reads-the-main-tree`).
# It was keyed and built from /home/user/rundesk whichever checkout called it,
# so a lane served from a worktree whose migration adds an index read as drift
# and was refused. The way round, a reference of the worktree's own in
# SCHEMA_REF_DIR, still rebuilt from the main tree into the one shared
# database, under a lock held in that directory only. Now the checkout is the
# one this file lives in (`schema_ref_root`). The main checkout keeps
# /tmp/claude-0 and `rundesk_schema_ref`; any other checkout, or any
# SCHEMA_REF_DIR, gets a directory and a database named after it, so two
# references never share a database or build under two locks.
#
# Names are left out of indexes and constraints: `drizzle-kit push` names a
# foreign key `…_fk` where a migration's `REFERENCES` makes `…_fkey`, and the
# same key under two names is not drift. What it constrains is.
schema_ref_root () { (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P); }
schema_ref_dir () {
  local R
  if [ -n "${SCHEMA_REF_DIR:-}" ]; then echo "$SCHEMA_REF_DIR"; return; fi
  R=$(schema_ref_root)
  if [ "$R" = /home/user/rundesk ]; then echo /tmp/claude-0
  else echo "/tmp/claude-0/schema-ref-$(printf '%s' "$R" | sha1sum | cut -c1-10)"; fi
}
schema_ref_db () {
  local dir
  dir=$(schema_ref_dir)
  if [ "$dir" = /tmp/claude-0 ]; then echo rundesk_schema_ref
  else echo "rundesk_schema_ref_$(printf '%s' "$dir" | sha1sum | cut -c1-10)"; fi
}
# ONE WRITER OR ANY NUMBER OF READERS PER LANE BUNDLE (`commit-log/log-d92d58f-1`).
# `verify.sh` refused a STALE bundle and nothing refused two writers: two
# `refresh-dists.sh` for one lane at once each emptied the other's output, and a
# rebuild could empty `/tmp/claude-0/dist-<k>` under a suite reading it. A run
# holds a shared `flock` on `<dist>.lock` for as long as it runs; a build takes
# it exclusive, so it waits for the runs and they wait for it. The kernel drops
# a lock when its holder dies, so nothing is left held after a kill.
#
#   dist_lock_shared    <dist> [seconds]  hold it shared on fd DIST_LOCK_FD
#   dist_lock_exclusive <dist> [seconds]  hold it exclusive on fd DIST_LOCK_FD
#   dist_lock_release                     let it go
#
# Each waits up to [seconds] (default 1200) and answers 1 if it could not get it.
dist_lock_take () {
  local mode=$1 dist=$2 wait=${3:-1200}
  exec {DIST_LOCK_FD}>"$dist.lock" || return 1
  flock "$mode" -w "$wait" "$DIST_LOCK_FD"
}
dist_lock_shared () { dist_lock_take -s "$@"; }
dist_lock_exclusive () { dist_lock_take -x "$@"; }
dist_lock_release () {
  [ -n "${DIST_LOCK_FD:-}" ] || return 0
  flock -u "$DIST_LOCK_FD"
  exec {DIST_LOCK_FD}>&-
  DIST_LOCK_FD=
}
# A PUSH THAT STOPPED IS NOT A PUSH (`found-29-sep/lane-push-errors-read-as-synced`).
# drizzle-kit 0.31 exits 0 when it stops on a question no pipe can answer
# ("Interactive prompts require a TTY terminal"), having applied nothing, so
# its status says nothing. A push is read as done only when its log says it
# applied the schema or found nothing to change, and holds no error.
push_log_ok () {
  [ -s "$1" ] || return 1
  grep -qE '\[✓\] Changes applied|No changes detected' "$1" || return 1
  ! grep -qE '^Error|Interactive prompts require' "$1"
}
schema_describe () {
  # psql's own status, not `sort`'s: piped straight into sort, a database that
  # could not be read described as nothing, and every line of the reference
  # read as missing from it (found by schema-drift-selfcheck.sh).
  local rows
  rows=$(PGPASSWORD=rundesk psql -h 127.0.0.1 -U rundesk -d "$1" -tAq -v ON_ERROR_STOP=1 -c "
    select 'column '||table_name||'.'||column_name||' '||data_type||' '||is_nullable||' default '||coalesce(column_default,'none')
      from information_schema.columns where table_schema='public'
    union all
    select 'index '||tablename||' '||regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ')
      from pg_indexes where schemaname='public'
    union all
    select 'constraint '||conrelid::regclass::text||' '||pg_get_constraintdef(oid)
      from pg_constraint where connamespace='public'::regnamespace
    union all
    select 'enum '||t.typname||' '||string_agg(e.enumlabel, ',' order by e.enumsortorder)
      from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' group by t.typname") || return 1
  [ -n "$rows" ] || return 1
  printf '%s\n' "$rows" | sort
}
schema_ref_ensure () {
  local R dir db key i
  R=$(schema_ref_root); dir=$(schema_ref_dir); db=$(schema_ref_db)
  mkdir -p "$dir"
  key=$( { find "$R/packages/db/src/schema" -type f -name '*.ts' -print0 | sort -z | xargs -0 cat
           ls "$R/packages/db/src/migrations"/*.sql; } | sha1sum | cut -c1-16)
  [ "$(cat "$dir/schema-ref.key" 2>/dev/null)" = "$key" ] && [ -s "$dir/schema-ref.txt" ] && return 0
  for i in $(seq 1 180); do lock_take "$dir/schema-ref.lock" && break; sleep 1; done
  lock_held "$dir/schema-ref.lock" || { echo "schema reference: could not take $dir/schema-ref.lock" >&2; return 1; }
  # Another shell may have built it while this one waited.
  if [ "$(cat "$dir/schema-ref.key" 2>/dev/null)" = "$key" ] && [ -s "$dir/schema-ref.txt" ]; then
    lock_drop "$dir/schema-ref.lock"; return 0
  fi
  echo "schema reference: building $db from the pristine dump and $R's schema source (key $key)" >&2
  export PGPASSWORD=rundesk
  [ -s "$dir/pristine.dump" ] || pg_dump -h 127.0.0.1 -U rundesk -d rundesk_pristine -Fc -f "$dir/pristine.dump"
  if ! { sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" >/dev/null 2>&1 \
           && sudo -u postgres psql -q -c "CREATE DATABASE $db OWNER rundesk" >/dev/null 2>&1 \
           && pg_restore -h 127.0.0.1 -U rundesk -d "$db" --no-owner --role=rundesk "$dir/pristine.dump" >"$dir/schema-ref-restore.log" 2>&1; true; } \
     || ! ( cd "$R/packages/db" && export DATABASE_URL="postgres://rundesk:rundesk@127.0.0.1:5432/$db" \
            && yes | pnpm exec drizzle-kit push --force > "$dir/schema-ref-push.log" 2>&1 \
            && push_log_ok "$dir/schema-ref-push.log" ) \
     || ! schema_describe "$db" > "$dir/schema-ref.txt.new" \
     || [ ! -s "$dir/schema-ref.txt.new" ]; then
    echo "schema reference: could not build it — see $dir/schema-ref-push.log" >&2
    rm -f "$dir/schema-ref.txt.new" "$dir/schema-ref.key"
    lock_drop "$dir/schema-ref.lock"; return 1
  fi
  mv "$dir/schema-ref.txt.new" "$dir/schema-ref.txt"
  echo "$key" > "$dir/schema-ref.key"
  lock_drop "$dir/schema-ref.lock"
}
lane_schema_drift () {
  local db="$1" dir out
  dir=$(schema_ref_dir)
  schema_ref_ensure || return 2
  out=$(schema_describe "$db" 2>&1) || { echo "cannot read $db: $out"; return 2; }
  out=$(diff <(cat "$dir/schema-ref.txt") <(printf '%s\n' "$out") | sed -n 's/^< /missing: /p; s/^> /extra: /p')
  [ -z "$out" ] && return 0
  printf '%s\n' "$out"
  return 1
}

# ── WHEN A LANE'S API STARTED, TO THE HUNDREDTH ─────────────────────────────
#
# `ps -o lstart` says whole seconds, worked out from a boot time the kernel
# also gives in whole seconds, so it reads up to a second early. `verify.sh`
# compared that with its build stamp's second, and refused a lane restarted in
# the stamp's second as "started before the build"
# (`found-6-oct/verify-refuses-a-lane-restarted-in-its-builds-second`). This
# reads the start in clock ticks (`/proc/<pid>/stat`, its 22nd field) and the
# boot from `/proc/uptime`, both in hundredths: the epoch second, to two places.
lane_started_at () {
  local pid=$1 ticks hz up now
  ticks=$(awk '{ sub(/^.*\) /, ""); print $20 }' "/proc/$pid/stat" 2>/dev/null)
  [ -n "$ticks" ] || return 1
  hz=$(getconf CLK_TCK)
  read -r up _ < /proc/uptime
  now=$(date +%s.%N)
  awk -v now="$now" -v up="$up" -v t="$ticks" -v hz="$hz" 'BEGIN { printf "%.2f\n", now - up + t / hz }'
}
# True when a start (`lane_started_at`) is before a build stamp (`stat -c %.2Y`)
# by more than the hundredths both are read to.
started_before () { awk -v s="$1" -v b="$2" 'BEGIN { exit !(s + 0.05 < b) }'; }

# ── A SUITE THAT IGNORES ITS TERM IS KILLED ─────────────────────────────────
#
# `timeout` sends SIGTERM and waits for the suite to act on it. One whose
# teardown had blocked on database locks did not, and ran twenty minutes past
# `timeout 900` until its lane's API was restarted
# (`found-6-oct/verify-timeout-ends-no-hung-suite`). So a KILL follows the TERM
# by `$2` seconds: `run_bounded <seconds> <grace> <command…>`.
run_bounded () { local secs=$1 grace=$2; shift 2; timeout -k "$grace" "$secs" "$@"; }

# ── A SUITE'S BROWSER SAVES A NAME IN ANY SCRIPT ────────────────────────────
#
# Chromium converts a download's name to its locale's charset, and the lanes'
# shells set no LANG. Under the POSIX locale that charset is ASCII, so
# "Übersicht.csv", a list's export named in Arabic, even "a — b.csv", were
# saved as "download", whatever the server and the page called them. A
# reader's desktop and GitHub's runners have a UTF-8 locale, so no lane could
# see what CI sees of such a name (`found-30-sep/lanes-save-downloads-in-ascii`).
# Each runner starts a suite under these, which its browser inherits — the
# suite's process only, not the lane's API, which the fleet scripts start as
# before:
#   run_bounded 900 30 env "${LANE_SUITE_LOCALE[@]}" node "test/e2e/$SUITE.mjs" …
LANE_SUITE_LOCALE=(LANG=C.UTF-8 LC_ALL=C.UTF-8)

# ── WHAT A BUNDLE WAS BUILT FROM ────────────────────────────────────────────
#
# `verify.sh` asked whether any source was newer than a bundle, by mtime, and a
# builder who put files back with `cp -p`, which keeps their earlier mtimes,
# had a bundle of other sources read as fresh
# (`found-6-oct/verify-takes-a-bundle-of-other-sources-as-fresh`). This is the
# content: every source's blob hash — the index's where the working copy
# matches it (git asks its stat cache, and reads again a file whose inode,
# size, mtime or ctime moved, as a `cp -p` moves the inode and ctime), the
# working copy's where it does not, and each untracked file's — hashed
# together, so staging changes nothing and a byte anywhere changes it.
# `refresh-dists.sh` writes it into the bundle (`.sources-hash`); `verify.sh`
# asks it again. Run in `$1`, or in the tree this file is in when none is
# given — not the main checkout (`found-5-oct/lane-scripts-build-the-main-checkout`).
WEB_SOURCE_PATHS="apps/web/src packages/ui/src packages/feature-flags/src packages/imports/src apps/web/index.html apps/web/vite.config.ts apps/web/tailwind.config.ts apps/web/postcss.config.js apps/web/public"
web_sources_hash () {
  # shellcheck disable=SC2086
  ( cd "${1:-$LANE_ENV_DIR/../..}" && python3 - $WEB_SOURCE_PATHS <<'PY'
import hashlib, subprocess, sys
paths = sys.argv[1:]
def git(*a):
    return subprocess.run(['git', *a], capture_output=True, check=True).stdout
blob = {}
for rec in git('ls-files', '-s', '-z', '--', *paths).split(b'\0'):
    if rec:
        meta, path = rec.split(b'\t', 1)
        blob[path] = meta.split()[1]
changed = [p for p in git('diff', '--name-only', '-z', '--', *paths).split(b'\0') if p]
untracked = [p for p in git('ls-files', '--others', '--exclude-standard', '-z', '--', *paths).split(b'\0') if p]
for p in changed + untracked:
    try:
        blob[p] = git('hash-object', '--', p).strip()
    except subprocess.CalledProcessError:
        blob.pop(p, None)  # deleted in the working tree
h = hashlib.sha1()
for p in sorted(blob):
    h.update(p + b'\0' + blob[p] + b'\n')
print(h.hexdigest())
PY
  )
}
