#!/usr/bin/env bash
#
# Does email actually leave this box?
#
#   bash deploy/verify-email.sh
#   RUNDESK_EMAIL=you@real.tld RUNDESK_PASSWORD='…' bash deploy/verify-email.sh
#
# Every other check in this repo can read its answer out of an HTTP response.
# Email cannot. Notifications send it fire-and-forget —
# `this.sendEmail(...).catch(() => undefined)` — so the API returns 200 whether
# the relay took the message, refused it, or was never configured at all. The
# only place the verdict exists is the API container's log:
#
#   [EMAIL SENT] To: …      the relay ACCEPTED it
#   Failed to send email…   the relay refused it, or SMTP is misconfigured
#   [DEV EMAIL] To: …       no transport — nothing was sent to anyone
#
# So this triggers a send and then reads the log for which of those happened.
#
# What it can and cannot tell you: SMTP acceptance is not delivery. A relay
# accepts a message and bounces it later if the mailbox does not exist — and
# the seeded admin is admin@rundesk.internal, which is not a real mailbox. To
# prove the whole path, run it as an account with an address you can open.
set -uo pipefail

cd "$(dirname "$0")/.."

ovr_email="${RUNDESK_EMAIL:-}"
ovr_pass="${RUNDESK_PASSWORD:-}"
ovr_port="${API_HOST_PORT:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

PORT="${ovr_port:-${API_HOST_PORT:-3010}}"
API="http://127.0.0.1:${PORT}/api/v1"
EMAIL="${ovr_email:-${RUNDESK_EMAIL:-admin@rundesk.internal}}"
PASSWORD="${ovr_pass:-${RUNDESK_PASSWORD:-Admin@123!}}"

PASS=0; FAIL=0
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
note() { printf '  \033[2m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 2; }
jget() { grep -o "\"$1\":[^,}]*" | head -1 | sed 's/.*://;s/"//g' || true; }

docker inspect rundesk-api >/dev/null 2>&1 \
  || die "rundesk-api container not found — this reads its log, so it has to run on the host."

say "How this instance is configured"
# Logged once at boot, so the whole log is searched rather than a recent window.
CONF=$(docker logs rundesk-api 2>&1 | grep -E 'SMTP (configured|is not fully configured)' | tail -1 || true)
if printf '%s' "$CONF" | grep -q 'SMTP configured'; then
  ok "SMTP is configured: ${CONF#*SMTP }"
elif printf '%s' "$CONF" | grep -q 'not fully configured'; then
  bad "SMTP is NOT configured — every send takes the [DEV EMAIL] path and reaches nobody"
  note "Set SMTP_HOST / SMTP_USER / SMTP_PASS (or the MAIL_* fallbacks) in .env and redeploy."
else
  note "no SMTP line in the log (it is printed once at boot; the container may have been restarted since)"
fi

say "Signing in as $EMAIL"
LOGIN=$(curl -fsS --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" || true)
TOKEN=$(printf '%s' "$LOGIN" | jget accessToken)
[ -n "$TOKEN" ] || die "login rejected — set RUNDESK_EMAIL / RUNDESK_PASSWORD"
echo "  ok"

say "Sending the test notification"
# A marker in the log to read from, so a send from anything else is not
# mistaken for this one.
SINCE=$(date -u +%Y-%m-%dT%H:%M:%S)
SENT=$(curl -fsS --max-time 30 -X POST "$API/notifications/test" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' || true)
printf '%s' "$SENT" | grep -q '"ok"' && ok "the endpoint answered: $(printf '%s' "$SENT" | head -c 200)" \
  || bad "test send -> $(printf '%s' "$SENT" | head -c 200)"

# The response says whether email was ATTEMPTED (channel on, not quiet hours).
# It cannot say whether it left, which is the whole reason for the log read.
WANTED=$(printf '%s' "$SENT" | jget email)
QUIET=$(printf '%s' "$SENT" | jget quietHours)
if [ "$WANTED" = "true" ]; then
  ok "email is switched on for this account and it is not quiet hours"
else
  bad "this account would not be emailed (email=$WANTED, quietHours=$QUIET) — turn the email channel on, or run as somebody it is on for"
  note "Nothing below can be conclusive while the account itself declines email."
fi

say "What the relay did with it"
sleep 3
LOG=$(docker logs rundesk-api --since "$SINCE" 2>&1 || true)
if printf '%s' "$LOG" | grep -q '\[EMAIL SENT\]'; then
  ok "the relay ACCEPTED it: $(printf '%s' "$LOG" | grep '\[EMAIL SENT\]' | tail -1 | sed 's/.*\[EMAIL SENT\]//')"
  note "Accepted is not delivered. If the address is not a real mailbox it bounces after this point."
  case "$EMAIL" in
    *@rundesk.internal)
      note "$EMAIL is not a real mailbox, so this proves the relay works and nothing about arrival."
      note "Re-run as an address you can open to prove the whole path:"
      note "  RUNDESK_EMAIL=you@real.tld RUNDESK_PASSWORD='…' bash deploy/verify-email.sh"
      ;;
  esac
elif printf '%s' "$LOG" | grep -q 'Failed to send email'; then
  bad "the relay REFUSED it: $(printf '%s' "$LOG" | grep 'Failed to send email' | tail -1 | sed 's/.*Failed to send email//')"
elif printf '%s' "$LOG" | grep -q '\[DEV EMAIL\]'; then
  bad "it took the [DEV EMAIL] path — no transport, so nothing was sent to anyone"
else
  bad "the log says nothing either way in that window"
  note "Email is dispatched without being awaited, so it can land a moment late; re-run, or:"
  note "  docker logs rundesk-api --since 2m | grep -iE 'email'"
fi

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && printf '\033[32m─── email leaves this box ───\033[0m\n' || printf '\033[31m─── email does not work here ───\033[0m\n'
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
