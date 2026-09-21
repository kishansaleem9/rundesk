# Check 7 — the block ends and the tab does not notice.
#
# Keep the last thing written instead of restoring when nothing is running. The
# ticker still runs, the title was still correct when it was written, and the
# app still hands the title back when you leave it (check 10 stays green) — the
# only thing that breaks is the moment the block is over, which is the moment
# the number on screen becomes a lie.
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "        : BASE_TITLE\n      if (next !== written) {"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    # BROKEN: once a countdown has been written it is never taken back
    s.replace(a, "        : (written ?? BASE_TITLE)\n      if (next !== written) {")
)
print('BROKE check 7: the finished countdown stays in the tab forever')
