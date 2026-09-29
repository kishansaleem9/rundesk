# THE GOAL'S HISTORY COMES OLDEST FIRST.
# Reddens: routes-with-readers: "the goal’s History lists each change of its value, newest first — 3 → 7, then 0 → 3 — with who made it"
import io
p = '/home/user/rundesk/apps/api/src/modules/goals/goals.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(eq(goalUpdates.goalId, goal.id))\n      .orderBy(desc(goalUpdates.createdAt))\n      .limit(100)\n'
b = '      .where(eq(goalUpdates.goalId, goal.id))\n      .orderBy(goalUpdates.createdAt)\n      .limit(100)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rwr-4-history-oldest-first: the history is oldest first')
