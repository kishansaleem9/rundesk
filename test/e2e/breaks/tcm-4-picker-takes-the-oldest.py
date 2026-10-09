# THE DEFAULT LIST IS THE WORKSPACE'S OLDEST, WHOEVER ASKS, as both copies of it had it.
# Both of the picker's guards go at once — the query's visibility filter and the rule
# asked of each candidate — because either alone still skips a list the asker is
# refused; the old picker had neither.
# Re-aimed 9 October (`found-24-sep/planner-default-list-read-by-nothing`): a member’s /task goes to their own Personal List before any
# list of the hierarchy is asked, so that goes too — else only a guest, who has none, reaches the picker.
# Reddens: task-creation-access: "the member’s /task goes to their own Personal List, not the oldest list they are refused nor the private one — and the admin’s to the admin’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          eq(lists.isArchived, false),\n          containerVisibilityFilter(this.db, actorId, false),\n          listVisibilityFilter(actorId, false),\n        ),\n      )\n      .orderBy(asc(lists.createdAt))\n      .limit(25)\n    for (const c of candidates) {\n      if (await this.canCreateTaskIn(c.id, actorId)) return c.id\n    }\n    return null\n'
b = '          eq(lists.isArchived, false),\n        ),\n      )\n      .orderBy(asc(lists.createdAt))\n      .limit(25)\n    return candidates[0]?.id ?? null\n'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    (a, b),
    ('    const personal = await ensurePersonalList(this.db, workspaceId, actorId)\n    if (personal) return personal.id\n', ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("tcm-4-picker-takes-the-oldest: applied")
