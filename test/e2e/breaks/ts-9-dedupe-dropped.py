# The server stops de-duplicating, so "Sara, Sara" draws two identical columns —
# the one failure a side-by-side grid cannot survive, because two columns of one
# person look exactly like two people who happen to be busy at the same times.
#
# IT RAN GREEN AGAINST AN E2E SUITE THAT CANNOT EXECUTE THIS LINE.
# `team-schedules.mjs` intercepts `**/api/**` at the browser context: every
# response is a stub and no server code runs in it whatever. So a patch to
# `planner.service.ts` could never redden it, and the green said nothing about
# the patch — it said the suite cannot reach the code. Nor could any wording of
# the claim have helped.
#
# The three statements that decide the columns are `teamScheduleColumns` now,
# and `team-schedule-columns.test.ts` asserts the facts the grid rests on: the
# caller's order kept, a repeated id collapsed to its FIRST position, empty ids
# dropped, an empty list answered rather than thrown, and the cap applied to the
# DE-DUPLICATED count — so the same person named nine times is one column and
# not a refusal.
#
# PREDICTED TWO of the six: the collapse itself, and the cap-after-de-dupe case,
# which is the one that shows the order of the two operations matters.
#
# Reddens: unit: team-schedule-columns.test.ts "collapses a repeated id, keeping
#   its FIRST position"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '  const unique = [...new Set(userIds.filter(Boolean))]\n'
b = '  const unique = userIds.filter(Boolean)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: a repeated id is no longer collapsed.')
