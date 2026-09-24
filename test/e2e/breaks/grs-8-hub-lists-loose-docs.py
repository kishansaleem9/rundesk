# THE HUB LISTS A GUEST THE WORKSPACE'S OWN DOCS: a chain located in no space
# counts as nobody's, so it is out of nobody's reach.
# Reddens: guest-read-scope: "a guest reads the docs of a space shared with them and a doc shared with them — not the open space’s, nor the workspace’s — and the docs hub lists the same; a member reads the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '    return (at.outside || (unlocatedRefused && !at.located)) && !at.shared'
b = '    return at.outside && !at.shared'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-8-hub-lists-loose-docs: a doc located nowhere is listed to a guest')
