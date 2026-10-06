# THE CLICKUP MERGE ASKS NOTHING OF THE TASK IT WRITES (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`):
# a view-only space's task and a task of a project its importer is at View on are set Done and Low.
# RE-AIMED 6 October (the review fix): with no rule asked, the assignee at Comment's priority merges too.
# Reddens: imports:
#   "a merge by a member granted workspace.import changes only the task they may change — both importers, with a space named and without: a view-only space’s task and a task of a project they are at View on stay as they were, each row refused in the write rule’s words"
#   "a merge by a member granted workspace.import into a task assigned to them in a space at Comment writes a status alone, and refuses a priority or a description in the write rule’s words, leaving the task as it was — both importers"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '              await this.access.assertMayMerge(this.db, { taskId: targetId, actorId: userId, fields })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-49-clickup-merge-skips-the-write-rule: the ClickUp merge skips the task write rule')
