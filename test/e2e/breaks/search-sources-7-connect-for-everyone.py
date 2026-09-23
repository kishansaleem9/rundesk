# EVERY MEMBER IS OFFERED CONNECT — which opens settings they cannot see, or replaces somebody else's account.
# Reddens: search-sources: "and a source nobody connected says so, with no Connect for a member who cannot open settings"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = "          {isAdmin && activeSource.heldBy !== 'someone-else' && (\n"
b = '          {(isAdmin || !isAdmin) && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-7-connect-for-everyone: applied")
