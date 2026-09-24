# ANY MEMBER REBUILDS THE SEARCH INDEX, as they could.
# Reddens: search-read-access: "and only a manager may rebuild the workspace’s search index (403 for a member) — the admin may"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '    if (!(await resolveIsManager(this.db, workspaceId, actorId, actorRole))) {\n'
b = '    if (!(await resolveIsManager(this.db, workspaceId, actorId, actorRole)) && false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-11-anyone-reindexes: applied")
