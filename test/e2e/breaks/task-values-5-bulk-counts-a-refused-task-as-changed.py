# THE BULK EDITOR ANSWERS A REFUSED TASK AS CHANGED (`found-30-sep/a-task-starts-after-it-is-due`):
# a task the rule refused is put under `updated`, and nothing is under `failed`.
#
# Reddens: task-values: "the bulk editor changes no task it would leave starting after its due date — that one is answered under failed, with the reason — and changes the rest (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        failed.push({\n          taskId,\n          reason: err instanceof Error ? err.message : 'unknown error',\n        })\n",
     "        updated.push({ id: taskId, refused: err instanceof Error ? err.message : 'unknown error' })\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-5-bulk-counts-a-refused-task-as-changed: a refused task is answered as changed')
