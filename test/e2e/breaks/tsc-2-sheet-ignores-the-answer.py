# THE SHEET IGNORES THE ANSWER and offers everything, as it did.
# Reddens: task-sheet-capabilities: "in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box"
#   or "in a comment-only space it offers the comment box, and no change to the task"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const caps: TaskCaps = isTaskCaps(capsQuery.data)\n'
b = "  const caps: TaskCaps = taskId === '' && isTaskCaps(capsQuery.data)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-2-sheet-ignores-the-answer: the sheet ignores the answer')
