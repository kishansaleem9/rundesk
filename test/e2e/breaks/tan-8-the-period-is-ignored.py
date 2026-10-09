# A VIEW IS COUNTED WHATEVER ITS PERIOD.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "a view counts in its own period: not in the last seven days, and in the week before; a period that ends before it begins, or is longer than a quarter, is refused in words (400)"
#   or "the arrows move the period — no further on than this week — and the week before shows the other member’s older view; a name searched leaves that person alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        inArray(taskViewEvents.userId, ids),\n        gte(taskViewEvents.viewedAt, from),\n        lt(taskViewEvents.viewedAt, to),\n      ))\n      .groupBy(taskViewEvents.userId)\n',
     "        inArray(taskViewEvents.userId, ids),\n        lt(taskViewEvents.viewedAt, to), // BROKEN: the period's start is ignored\n      ))\n      .groupBy(taskViewEvents.userId)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-8-the-period-is-ignored: the period is ignored')
