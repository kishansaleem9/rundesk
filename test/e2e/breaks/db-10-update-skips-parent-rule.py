# PATCH'S PARENT UNCHECKED: a doc moved under another workspace's doc.
# Reddens: doc-boundaries: "nor moved under one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '    if (writable.parentDocId) await this.assertDocParent(writable.parentDocId, doc.workspaceId, userId, docId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-10-update-skips-parent-rule: applied")
