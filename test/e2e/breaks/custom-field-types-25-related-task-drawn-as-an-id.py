# The related task is drawn as its uuid. A column of ids looks like data and is a
# reference nobody can follow.
# Reddens: custom-field-types: "the tasks row draws the related task by TITLE, not by id"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "            {titleOf(id) ?? t('taskDetail.fieldType.tasksUnknown')}\n"
b = '            {id}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a related task is drawn as its id.')
