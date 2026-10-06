# SEARCH HANDS A GUEST EVERY CLIP (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The clip branch never looks a guest's matches up, so the admin's clip and
# its storage key are found again.
#
# Reddens: unit: search.service.test.ts "a guest finds the clips they recorded and nobody else’s; a member finds every clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      if (!readsOnlyOwnClips(reader.role)) return matches.slice(0, limit).map(hitOf)\n'
b = "      if (reader.role !== 'nobody') return matches.slice(0, limit).map(hitOf)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-20-search-hands-a-guest-every-clip-unit: applied')
