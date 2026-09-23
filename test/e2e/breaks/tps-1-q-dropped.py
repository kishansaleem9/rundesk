# THE WORDS NEVER REACH THE QUERY: the route takes `q` and passes nothing on.
# Reddens: task-pickers-search: "the oldest task is not among the newest 200 — and its own word finds it, and only it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = "      assigneeId: assigneeId === 'me' ? user.id : undefined,\n      q,\n    })\n"
b = "      assigneeId: assigneeId === 'me' ? user.id : undefined,\n    })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-1-q-dropped: applied")
