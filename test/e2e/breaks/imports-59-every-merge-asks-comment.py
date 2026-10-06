# EVERY MERGE ASKS THE COMMENT LEVEL (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`): an assignee at Comment merges a priority and a
# description into their task, which their PATCH of either is refused.
# Reddens: imports: "a merge by a member granted workspace.import into a task assigned to them in a space at Comment writes a status alone, and refuses a priority or a description in the write rule’s words, leaving the task as it was — both importers"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '  await writable(db, params.taskId, params.actorId, { level: mergeLevel(params.fields) })\n'
b = "  await writable(db, params.taskId, params.actorId, { level: 'comment' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-59-every-merge-asks-comment: every merge asks the comment level')
