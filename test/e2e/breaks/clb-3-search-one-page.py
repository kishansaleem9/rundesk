# SEARCH READS THE FIRST 200 CLIPS, the oldest, as it did.
# Reddens: clip-library: "search finds the newest clip by its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      const listed = (await r2.listAllObjects(`workspaces/${workspaceId}/clips/`)).reverse()\n'
b = '      const listed = (await r2.listAllObjects(`workspaces/${workspaceId}/clips/`)).slice(0, 200)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clb-3-search-one-page: search reads the oldest 200 clips')
