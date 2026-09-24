# MEILI'S TASK HITS WITH THE PRIVATE-ITEM RULE ONLY, as they were: a private space's tasks let through.
# Re-anchored, and its claim renamed, when the reach took the list's own
# privacy (`found-24-sep/private-lists-skipped-by-task-reads`); the edit is the
# same: the hits lose their reach.
# Reddens: unit: search.service.test.ts "holds a task hit to its reach — space, project and list — as well as the private-item rule"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      conds.push(taskInReachFilter(this.db, workspaceId, userId, false))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-2-meili-tasks-skip-containers: applied")
