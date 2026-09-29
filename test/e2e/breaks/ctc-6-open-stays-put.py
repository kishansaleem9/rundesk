# CREATE AND OPEN CLOSES THE MODAL AND OPENS NOTHING.
# Reddens: create-task-chevron: "Create and open makes one task, closes the modal and opens the new task’s sheet on its list, here a list picked under the space alone"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    if (then === 'open' && open) {\n      onClose()\n      open()\n"
b = "    if (then === 'open' && open) {\n      onClose()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-6-open-stays-put: Create and open does not go to the task')
