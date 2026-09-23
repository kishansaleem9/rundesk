# SOMEBODY ELSE'S ACCOUNT IS CONNECTED FOR EVERYONE: the tab promises results that the query will not give them.
# Reddens: search-sources: "the admin’s Gmail is connected for the admin, and for a member it is somebody else’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "        : { id, provider, connected: false, heldBy: 'someone-else' as const }\n"
b = "        : { id, provider, connected: true, heldBy: 'someone-else' as const }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-5-others-told-connected: applied")
