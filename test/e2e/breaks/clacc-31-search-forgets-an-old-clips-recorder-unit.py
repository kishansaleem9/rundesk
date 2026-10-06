# SEARCH FORGETS WHO RECORDED A CLIP FROM BEFORE THE ID (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Search's clip branch reads its searcher without an address: a guest no longer
# finds the clips they recorded before clips carried their recorder's id.
#
# Reddens: unit: search.service.test.ts "a guest finds a clip from before its recorder’s id by the address their users row holds now"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      const reader = await clipReaderOf(this.db, workspaceId, userId)\n'
b = '      const reader = { ...(await clipReaderOf(this.db, workspaceId, userId)), email: null }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-31-search-forgets-an-old-clips-recorder-unit: applied')
