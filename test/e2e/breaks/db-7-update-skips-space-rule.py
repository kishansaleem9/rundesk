# PATCH'S SPACE UNCHECKED: a doc refiled under another workspace's space.
# Reddens: doc-boundaries: "and so does moving a doc between spaces"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '    if (writable.spaceId) await this.assertDocSpace(writable.spaceId, doc.workspaceId, userId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-7-update-skips-space-rule: applied")
