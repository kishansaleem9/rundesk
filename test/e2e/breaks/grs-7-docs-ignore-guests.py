# THE DOC RULE TREATS A GUEST AS A MEMBER: every open space's docs, and the
# workspace's, are theirs to read and are listed in their hub.
# Reddens: guest-read-scope: "a guest reads the docs of a space shared with them and a doc shared with them — not the open space’s, nor the workspace’s — and the docs hub lists the same; a member reads the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '  if (toGuest) return new Set([...toGuest, NO_SPACE])'
b = '  if (toGuest && toGuest.length < 0) return new Set([...toGuest, NO_SPACE])'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-7-docs-ignore-guests: the doc rule treats a guest as a member')
