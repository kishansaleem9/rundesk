# shellcheck shell=bash
# Publish apps/web/dist.new as apps/web/dist, keeping the previous *build's*
# chunks alongside the new ones. Sourced by deploy/deploy.sh and
# deploy/deploy-prod.sh — both publish the SPA, and a fix in only one of them
# never reaches production.
#
# Why keep them: every screen is a dynamic import and every build renames its
# chunks. A tab that was open when we deploy is still running the old
# index.html; if the chunks it names disappear, every lazy import 404s and the
# app is replaced by the error boundary. Two generations on disk means those
# tabs never notice a deploy at all. (apps/web/src/lib/chunk-reload.ts is the
# in-app safety net for anything that slips through.)
#
# Which two generations, and how they're tracked: by manifest, never by file
# age. The first version of this pruned with `find -mtime +14 -delete`, which
# on 20 Aug 2026 deleted the exact chunks it had just carried over, because the
# preceding build was 15 days old. File mtimes are wrong for this twice over —
# deploys can be arbitrarily far apart, and `--output type=local` writes the
# mtimes recorded in the Docker layer, so a cached build layer exports files
# stamped with whenever that layer was first built, not when it was published.
#
# apps/web/.build-assets records what *this* build emitted, before anything is
# merged in. Next deploy reads it to know which files on disk belong to the
# outgoing build and are therefore worth keeping. Everything older falls away.

publish_web_dist() {
  local manifest=apps/web/.build-assets
  local prev_list=""

  if [ -f "$manifest" ]; then
    prev_list="$(cat "$manifest")"
  elif [ -d apps/web/dist/assets ]; then
    # First publish after this change: whatever is on disk is the last build.
    prev_list="$(ls apps/web/dist/assets)"
  fi

  rm -rf apps/web/assets.prev
  if [ -d apps/web/dist/assets ]; then
    mv apps/web/dist/assets apps/web/assets.prev
  fi
  rm -rf apps/web/dist
  mv apps/web/dist.new apps/web/dist

  # Record this build's own output first — before the previous release's chunks
  # are merged in — or the manifest would grow by a generation every deploy.
  ls apps/web/dist/assets > "$manifest"

  local carried=0
  if [ -d apps/web/assets.prev ]; then
    local name
    while IFS= read -r name; do
      [ -n "$name" ] || continue
      if [ -e "apps/web/assets.prev/$name" ] && [ ! -e "apps/web/dist/assets/$name" ]; then
        cp -a "apps/web/assets.prev/$name" "apps/web/dist/assets/$name"
        carried=$((carried + 1))
      fi
    done <<< "$prev_list"
    rm -rf apps/web/assets.prev
  fi

  echo "▶ published $(ls apps/web/dist/assets | wc -l) assets ($carried carried over from the previous release)"
}
