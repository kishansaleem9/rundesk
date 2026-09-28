# DELETING RECORDS NO DELETER, so the doc is in nobody's Trash.
# Reddens: doc-trash-level: "a guest with an Edit share deletes the doc (200), and it is in their own Trash — ClickUp: guests with edit permissions delete Docs"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .set({ isArchived: true, archivedAt: new Date(), archivedById: userId, updatedAt: new Date() })\n'
b = '      .set({ isArchived: true, archivedAt: new Date(), archivedById: null, updatedAt: new Date() })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtl-5-deleter-not-recorded: done')
