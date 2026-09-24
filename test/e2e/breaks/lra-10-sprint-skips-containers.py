# A SPRINT'S TASKS WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's task listed and counted.
# Reddens: lookup-read-access: "and a sprint already holding such tasks lists and counts, for the member, only the open one — the admin’s has the refused one too, and nobody’s the other workspace’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = '    return and(containerVisibilityFilter(this.db, actor.id, isManager), taskVisibilityFilter(this.db, actor.id, isManager))\n'
b = '    return taskVisibilityFilter(this.db, actor.id, isManager)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-10-sprint-skips-containers: applied")
