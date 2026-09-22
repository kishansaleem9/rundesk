# Check 10 — the countdown outlives the app.
#
# Drop the one line in the effect's cleanup that hands the title back. The
# countdown keeps working perfectly while you are in the app; leave it, and the
# tab strip still advertises a time block on a page that has never heard of
# one. Nothing else changes, which is exactly why this is easy to ship.
#
# THE FIRST VERSION OF THIS PATCH APPLIED AND CHECK 10 STAYED GREEN, and the
# fault was in the hook, not the check: the effect ALSO wrote the base title in
# its `if (!workspaceId)` branch, and leaving /app re-runs the effect with no
# workspace id in the path a beat before the shell unmounts. That duplicate was
# covering for the line this patch deletes — two code paths satisfying one
# check is one check. The duplicate is gone, so this patch now has nothing
# standing behind it.
#
# Reddens: tab-title-countdown: "met the navigation, and the tab reads"
import io, sys
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = """      stop()
      // Leaving the app hands the title back. Without this line a countdown
      // written here would still be in the tab strip on the login page.
      document.title = BASE_TITLE
"""
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "      stop()\n      // BROKEN: the title is left wherever it was\n")
)
print('BROKE check 10: leaving /app leaves the countdown in the tab')
