# A CLICKUP MERGE'S SUBTASK LINKS ASK NO LEVEL OF A TASK THAT WAS ALREADY THERE (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`):
# a task the member may only Comment on goes under a new task, and a new task under one they may not Full-edit.
# Re-aimed 6 October: a parent is asked Full edit as 'subtask', which says what it refuses (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
# Reddens: imports: "a ClickUp merge by a member granted workspace.import links a subtask to or under a task that was already there only as the routes let them: their task at Comment is merged and stays where it was, and nothing goes under a task they may not Full-edit — each link refused in the rule’s words"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a1 = "  if (params.childWasThere) await writable(db, childId, actorId, { level: 'edit' })\n"
b1 = ''
assert s.count(a1) == 1, f'anchor appears {s.count(a1)} times in {p}, expected exactly 1'
s = s.replace(a1, b1)
a2 = "  if (params.parentWasThere) await writable(db, parentId, actorId, { level: 'subtask' })\n"
b2 = ''
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
s = s.replace(a2, b2)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-56-clickup-links-ask-no-level: a subtask link asks no level of the tasks it touches')
