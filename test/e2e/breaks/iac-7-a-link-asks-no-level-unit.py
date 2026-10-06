# A SUBTASK LINK ASKS NO LEVEL OF A TASK THAT WAS ALREADY THERE (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: import-access.test.ts "asks edit of a child that was already there and Full edit of a parent that was already there — no level of a task the run made — and a refusal is the rule’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a1 = "  if (params.childWasThere) await writable(db, childId, actorId, { level: 'edit' })\n"
b1 = ''
assert s.count(a1) == 1, f'anchor appears {s.count(a1)} times in {p}, expected exactly 1'
s = s.replace(a1, b1)
a2 = "  if (params.parentWasThere) await writable(db, parentId, actorId, { level: 'full' })\n"
b2 = ''
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
s = s.replace(a2, b2)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-7-a-link-asks-no-level-unit: a subtask link asks no level of the tasks it touches')
