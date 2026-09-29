# A TASK MADE WITHOUT LEAVING THE PAGE IS MADE IN SILENCE: NO TOAST NAMES IT OR ITS LIST.
# Reddens: create-task-chevron: "Create and close makes one task, closes the modal and leaves the page where it was, with a toast naming the task and its list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    toast.success(\n      t('quickCreate.taskCreatedIn',"
b = "    console.debug(\n      t('quickCreate.taskCreatedIn',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-5-close-says-nothing: the Task created toast is not shown')
