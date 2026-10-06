# EVERY MERGE ASKS THE COMMENT LEVEL (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: import-access.test.ts "asks the write rule of the task it merges into at the level of what it writes: comment for a status, edit for anything else"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '  await writable(db, params.taskId, params.actorId, { level: mergeLevel(params.fields) })\n'
b = "  await writable(db, params.taskId, params.actorId, { level: 'comment' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-6-a-merge-asks-comment-of-every-field-unit: every merge asks the comment level')
