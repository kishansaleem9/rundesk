# A WORKSPACE DOC OPENS FOR A GUEST by id: the one-doc rule forgets that a
# chain located in no space is the workspace's.
# Reddens: guest-read-scope: "a guest reads the docs of a space shared with them and a doc shared with them — not the open space’s, nor the workspace’s — and the docs hub lists the same; a member reads the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '  if (!located && refused.has(NO_SPACE)) outside = true\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-9-loose-doc-by-id: a doc located nowhere opens for a guest')
