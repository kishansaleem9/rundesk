#!/usr/bin/env bash
# Add the no-cache location block to the *installed* nginx vhost.
#
# `./deploy/deploy.sh nginx` copies deploy/nginx/rundesk.theaura.agency.conf into
# /etc/nginx/sites-available and then lets certbot rewrite it with the SSL block.
# So the live file is not the repo file, and re-running `deploy.sh nginx` would
# clobber certbot's work. This edits the live file in place instead: it inserts
# the block ahead of `location /api/`, keeping everything certbot added.
#
# Why it matters: index.html is the manifest naming the content-hashed chunks.
# Served with no cache headers (which is what it had), browsers apply heuristic
# freshness and reuse it for hours — pointing a returning user at chunks a later
# deploy has deleted. That is the crash in §0 of docs/video1-rundesk-gap-audit.md.
#
#   sudo ./deploy/patch-nginx-cache-headers.sh          # patch, test, reload
#   VHOST=/path/to/conf ./deploy/patch-nginx-cache-headers.sh --dry-run
#
# Idempotent: running it twice is a no-op. If `nginx -t` fails the original file
# is put back before anything is reloaded.
set -euo pipefail

VHOST="${VHOST:-/etc/nginx/sites-enabled/rundesk.theaura.agency}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

if [ ! -f "$VHOST" ]; then
  echo "✗ no vhost at $VHOST — set VHOST=… or run ./deploy/deploy.sh nginx first"
  exit 1
fi

if grep -q 'Cache-Control "no-cache"' "$VHOST"; then
  echo "✓ $VHOST already sends no-cache for index.html — nothing to do"
  exit 0
fi

if ! grep -qE '^[[:space:]]*location /api/ \{' "$VHOST"; then
  echo "✗ $VHOST has no 'location /api/ {' to anchor on — patch it by hand"
  echo "  (copy the no-cache block from deploy/nginx/rundesk.theaura.agency.conf)"
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Anchor above the "# API" comment when the vhost still has it, so the comment
# stays attached to the block it describes.
ANCHOR='^[[:space:]]*location /api/ \{'
if grep -qE '^[[:space:]]*# API[[:space:]]*$' "$VHOST"; then
  ANCHOR='^[[:space:]]*# API[[:space:]]*$'
fi

awk -v anchor="$ANCHOR" '
  !inserted && $0 ~ anchor {
    print "    # The entry point and the service worker must never be reused from cache."
    print "    # index.html is the manifest that names the hashed chunks; a stale copy"
    print "    # points at files a later deploy has removed, so every lazy import 404s"
    print "    # and the app dies. See apps/web/src/lib/chunk-reload.ts."
    print "    location ~ ^/(index\\.html|sw\\.js|registerSW\\.js|push-sw\\.js|manifest\\.webmanifest)$ {"
    print "        add_header Cache-Control \"no-cache\" always;"
    print "        try_files $uri /index.html;"
    print "    }"
    print ""
    inserted = 1
  }
  { print }
' "$VHOST" > "$TMP"

if ! grep -q 'Cache-Control "no-cache"' "$TMP"; then
  echo "✗ insertion produced no change — refusing to install"
  exit 1
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "--- would install: ---"
  diff -u "$VHOST" "$TMP" || true
  exit 0
fi

# NOT beside the vhost: Debian's nginx.conf includes sites-enabled/* wholesale,
# so a backup left there is *loaded as config* — you get "conflicting server
# name … ignored" and a second, stale copy of the site one filename away from
# taking precedence. Keep backups out of every include path.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rundesk-nginx}"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/$(basename "$VHOST").bak.$(date +%Y%m%d%H%M%S)"
cp "$VHOST" "$BACKUP"
echo "▶ backed up to $BACKUP"

# sites-enabled is usually a symlink into sites-available; write through it.
TARGET="$(readlink -f "$VHOST")"
cat "$TMP" > "$TARGET"

if ! nginx -t; then
  echo "✗ nginx -t failed — restoring $BACKUP, nothing was reloaded"
  cat "$BACKUP" > "$TARGET"
  exit 1
fi

systemctl reload nginx
echo "✓ patched $TARGET and reloaded nginx"
