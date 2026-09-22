# Check 1 — an all-day block hijacks the tab.
#
# Stop excluding all-day blocks. An all-day block contains the present instant
# just as surely as a running one does, so the tab spends the whole day
# counting down to midnight: "Work on … · 23h 41m left". Every number is
# correct and the tab is useless, which is the version of this bug that would
# survive review.
#
# IT NAMED THE CHECK ABOUT THE ALL-DAY BLOCK, WHICH PASSES. The all-day case
# still puts no countdown in the tab — that half is untouched. What falls is the
# check after it: a block that has ENDED leaves its countdown in the tab, which
# is the same defect seen from the side that matters more, because a stale
# countdown reads as live.
#
# PREDICTED ONE.
#
# Reddens: tab-title-countdown: "when the block ends the tab returns to the
#   title index.html shipped"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (block.isAllDay) continue\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "    // BROKEN: all-day blocks count down too\n")
)
print('BROKE check 1: an all-day block puts a day-long countdown in the tab')
