# GETTASK'S SUBTASKS AS THEY WERE: every row that names this task as its parent.
# Reddens: task-boundaries: "its subtasks are its own workspace’s only"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      row.subtasks = row.subtasks.filter((st) => ownIds.has(st.id))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-40-foreign-subtasks-shown: applied")
