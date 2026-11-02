# A WORKSPACE'S SEARCH FINDS THE TASKS OF EVERY WORKSPACE ITS SEARCHER RUNS.
# Reddens: workspace-ownership: "a workspace’s task is not found by searching another, its address opens it in its own workspace — the switcher saying which — and somebody in neither is refused it and shown nothing of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '          const conds: Array<SQL | undefined> = [\n            eq(spaces.workspaceId, workspaceId),\n'
b = '          const conds: Array<SQL | undefined> = [\n            undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-17-search-reads-every-workspace: applied")
