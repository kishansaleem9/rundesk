# THE DEFAULT LIST IS THE WORKSPACE'S OLDEST, WHOEVER ASKS, as both copies of it had it.
# Both of the picker's guards go at once — the query's visibility filter and the rule
# asked of each candidate — because either alone still skips a list the asker is
# refused; the old picker had neither.
# Reddens: task-creation-access: "the member’s /task goes to the oldest list they may make a task in, not the older one they are refused — the admin’s goes to the oldest"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          eq(lists.isArchived, false),\n          containerVisibilityFilter(this.db, actorId, false),\n          listVisibilityFilter(actorId, false),\n        ),\n      )\n      .orderBy(asc(lists.createdAt))\n      .limit(25)\n    for (const c of candidates) {\n      if (await this.canCreateTaskIn(c.id, actorId)) return c.id\n    }\n    return null\n'
b = '          eq(lists.isArchived, false),\n        ),\n      )\n      .orderBy(asc(lists.createdAt))\n      .limit(25)\n    return candidates[0]?.id ?? null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-4-picker-takes-the-oldest: applied")
