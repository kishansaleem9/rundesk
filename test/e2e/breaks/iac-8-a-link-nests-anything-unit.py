# A SUBTASK LINK KEEPS NO LEVEL AND LETS A TASK BE ITS OWN PARENT (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: import-access.test.ts "refuses, in the routes’ words, a task as its own parent, a parent that is a subtask, and a child that has subtasks — whoever links them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (childId === parentId) throw new BadRequestException('A task cannot be its own parent')\n  const [parent] = await db.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, parentId)).limit(1)\n  if (parent?.parentTaskId) throw new BadRequestException('Subtasks can only be nested one level deep')\n  const [child] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, childId)).limit(1)\n  if (child) throw new BadRequestException('A task with subtasks cannot become a subtask itself')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-8-a-link-nests-anything-unit: a subtask link asks neither one level nor that a task is not its own parent')
