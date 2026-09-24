# SEARCH'S TASKS WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's task found.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: search-read-access: "a search narrowed by a task filter returns tasks alone, and only tasks the member may open"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '            // private space they were refused (`workspace-read-access` §8).\n            taskInReachFilter(this.db, workspaceId, userId, isManager),\n'
b = '            // private space they were refused (`workspace-read-access` §8).\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-1-search-tasks-skip-containers: applied")
