#!/usr/bin/env bash
# THE DEPLOY SAYS WHEN R2_PUBLIC_URL SERVES THE PRIVATE BUCKET
# (`found-30-sep/domain-left-on-the-private-bucket`).
#
# The API logs at boot when R2_PUBLIC_URL is a domain of R2_BUCKET_NAME — it then
# sends nobody there, but the domain still serves every private object by its key
# until it is disconnected — and nobody reads a boot log. `deploy.sh rebuild`
# reads it (`warn_if_public_domain_on_private_bucket`) and says so with the four
# steps. Its own function, run here against a docker that answers with a log
# this test writes, and a sleep that does not sleep.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

awk '/^warn_if_public_domain_on_private_bucket\(\) \{/,/^}/' "$ROOT/deploy/deploy.sh" > "$WORK/fn.sh"
if ! grep -q 'warn_if_public_domain_on_private_bucket' "$WORK/fn.sh"; then
  echo "FAIL deploy.sh has no warn_if_public_domain_on_private_bucket"
  exit 1
fi
if ! grep -q '^    warn_if_public_domain_on_private_bucket$' "$ROOT/deploy/deploy.sh"; then
  echo "FAIL deploy.sh defines the warning and a rebuild never calls it"
  exit 1
fi
mkdir -p "$WORK/bin"
printf '#!/usr/bin/env bash\ncat "$FAKE_LOG"\n' > "$WORK/bin/docker"
printf '#!/usr/bin/env bash\nexit 0\n' > "$WORK/bin/sleep"
chmod +x "$WORK/bin/docker" "$WORK/bin/sleep"

pass=0
fail=0
# case <name> <log> <must match, or ''> <must not match, or ''>
#
# Run as deploy.sh runs it, under its `set -euo pipefail`, and the rebuild must go
# on after it: run without them, a log with nothing to say passed here, while on
# production (21 October, its first deploy) the grep that found nothing ended the
# rebuild there, silently, before "✓ Rebuild complete.".
check() {
  printf '%s\n' "$2" > "$WORK/log"
  local out
  out=$(PATH="$WORK/bin:$PATH" FAKE_LOG="$WORK/log" bash -c "set -euo pipefail; source '$WORK/fn.sh'; warn_if_public_domain_on_private_bucket; echo 'and the rebuild goes on'" 2>&1)
  if ! grep -q 'and the rebuild goes on' <<<"$out" \
    || { [ -n "$3" ] && ! grep -qE "$3" <<<"$out"; } || { [ -n "$4" ] && grep -qE "$4" <<<"$out"; }; then
    echo "  FAIL $1 — it said: ${out:-nothing}"
    fail=$((fail + 1))
  else
    echo "  PASS $1"
    pass=$((pass + 1))
  fi
}

STARTED='[Nest] 1  - 10/14/2026, 9:00:01 AM     LOG [NestApplication] Nest application successfully started'
check 'a domain on the private bucket is said loudly: the four steps, and the API'"'"'s own words' \
  "[Nest] 1  - 10/14/2026, 9:00:00 AM   ERROR [R2Service] R2_PUBLIC_URL (https://files.example.com) serves the objects of R2_BUCKET_NAME (rundesk-files) to anybody, unsigned. Disconnect that domain from rundesk-files.
$STARTED" \
  'is a domain of the private bucket.*|4\. \./deploy/deploy\.sh rebuild' ''
check 'and the API'"'"'s words are its own, the log'"'"'s prefix taken off' \
  "[Nest] 1  - 10/14/2026, 9:00:00 AM   ERROR [R2Service] R2_PUBLIC_URL (https://files.example.com) serves the objects of R2_BUCKET_NAME (rundesk-files) to anybody, unsigned.
$STARTED" \
  "The API's own words: R2_PUBLIC_URL \(https://files\.example\.com\)" '\[Nest\]'
check 'a check the API could not make is said softly, not as the alarm' \
  "[Nest] 1  - 10/14/2026, 9:00:00 AM    WARN [R2Service] Could not check whether R2_PUBLIC_URL (https://files.example.com) serves R2_BUCKET_NAME: timeout
$STARTED" \
  'could not check whether R2_PUBLIC_URL serves the private bucket' 'is a domain of the private bucket'
check 'a domain on its own bucket says nothing' \
  "[Nest] 1  - 10/14/2026, 9:00:00 AM     LOG [R2Service] Avatars and workspace logos are served from R2_PUBLIC_URL (https://files.example.com); it serves no object of R2_BUCKET_NAME
$STARTED" \
  '' '⚠'
check 'and an API that never says either says nothing, without waiting for ever' \
  '' \
  '' '⚠'

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
