# Check 1 — an all-day block hijacks the tab.
#
# Stop excluding all-day blocks. An all-day block contains the present instant
# just as surely as a running one does, so the tab spends the whole day
# counting down to midnight: "Work on … · 23h 41m left". Every number is
# correct and the tab is useless, which is the version of this bug that would
# survive review.
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (block.isAllDay) continue\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "    // BROKEN: all-day blocks count down too\n")
)
print('BROKE check 1: an all-day block puts a day-long countdown in the tab')
