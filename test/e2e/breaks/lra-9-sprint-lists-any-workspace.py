# A SPRINT LISTS WHATEVER ITS ROWS POINT AT, as it did: another workspace's task by title.
# Reddens: lookup-read-access: "and a sprint already holding such tasks lists and counts, for the member, only the open one — the admin’s has the refused one too, and nobody’s the other workspace’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = '      .where(and(inArray(sprintTasks.sprintId, sprintIds), eq(spaces.workspaceId, workspaceId), visFilter))\n'
b = '      .where(and(inArray(sprintTasks.sprintId, sprintIds), visFilter))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-9-sprint-lists-any-workspace: applied")
