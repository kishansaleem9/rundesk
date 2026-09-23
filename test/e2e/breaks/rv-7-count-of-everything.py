# THE COUNT TAKEN BEFORE THE FILTER: the titles are hidden, and the number beside
# them says how many there really are.
# Reddens: read-visibility: "and the card’s count is of what it shows — a count of hidden work says it exists"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '    const byPerson = new Map<string, typeof rows>()\n'
b = "    const allRows = await this.db\n      .select({ userId: taskAssignees.userId, id: tasks.id })\n      .from(taskAssignees)\n      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))\n      .innerJoin(lists, eq(lists.id, tasks.listId))\n      .innerJoin(projects, eq(projects.id, lists.projectId))\n      .innerJoin(spaces, eq(spaces.id, projects.spaceId))\n      .where(and(eq(spaces.workspaceId, workspaceId), inArray(taskAssignees.userId, ids), eq(tasks.isArchived, false), ne(tasks.statusCategory, 'closed')))\n    const allByPerson = new Map<string, unknown[]>()\n    for (const r of allRows) allByPerson.set(r.userId, [...(allByPerson.get(r.userId) ?? []), r])\n    const byPerson = new Map<string, typeof rows>()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '      const own = byPerson.get(person.userId) ?? []\n'
b = '      const own = byPerson.get(person.userId) ?? []\n      const everything = allByPerson.get(person.userId) ?? own\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '        openCount: own.length,\n'
b = '        openCount: everything.length,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-7-count-of-everything: applied")
