# SEARCH'S COMMENTS WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's comment, and its task's title.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: search-read-access: "a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '            ilike(taskComments.body, like),\n            taskInReachFilter(this.db, workspaceId, userId, isManager),\n'
b = '            ilike(taskComments.body, like),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-4-search-comments-skip-containers: applied")
