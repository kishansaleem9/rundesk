# A TASK MADE FROM A TEMPLATE IS READ BACK WITH NO ID, AS THE OLD SUBMIT READ IT.
#
# The instantiate route answers `{ taskId, task }`, not a task. Reading `.id`
# off that answer is what the old select's submit did: measured, its watcher
# went to `/tasks/undefined/watchers` and the page landed on the list with no
# task open.
#
# Reddens: create-modal-templates: "and it opens the task it made from the template, as Create task does without one"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    return { id: made.taskId, title: made.task?.title }\n"
b = "    return { id: (made as unknown as { id: string }).id, title: made.task?.title }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-12-the-answer-read-as-a-task: the new task comes back as undefined')
