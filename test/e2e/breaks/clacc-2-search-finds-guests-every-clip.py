# SEARCH HANDS A GUEST EVERY CLIP'S NAME AND KEY (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The clip branch of search looks a guest's matches up and then keeps them
# whoever recorded them: the admin's clip is found again, with the storage key
# that the link route takes.
#
# Reddens: clip-library-access: "search finds a guest the clips they recorded and nobody else’s — a member finds the admin’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "          if (own.length < limit && mayReadClip(metas[i], reader)) own.push(key)\n"
b = "          if (own.length < limit) own.push(key)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-2-search-finds-guests-every-clip: search finds a guest every clip')
