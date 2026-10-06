# A GUEST'S CLIP MATCHES ARE LOOKED UP ONE AT A TIME (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Search looks a guest's matches up one store round trip after another, as it
# did: a query every clip's name holds walks the workspace's clips one by one.
#
# Reddens: unit: search.service.test.ts "a guest’s matches are looked up a page at a time, together, not one store round trip after another"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = 'const CLIP_LOOKUPS_AT_ONCE = 200\n'
b = 'const CLIP_LOOKUPS_AT_ONCE = 1\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-30-a-guests-matches-are-looked-up-one-by-one-unit: applied')
