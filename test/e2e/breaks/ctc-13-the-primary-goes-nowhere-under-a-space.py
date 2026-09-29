# THE PRIMARY GOES TO THE TASK ONLY WHEN A PROJECT WAS PICKED: on a list picked under the space alone it closes the modal and says nothing.
# Reddens: create-task-chevron: "and the primary does the same on a list picked under the space alone: one task, the modal closed, and the task opened on its list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      const open = opener(task.id)\n      if (!open) return createdThen(task, \'close\')\n      onClose()\n      open()\n'
b = '      const open = projectId ? opener(task.id) : null\n      onClose()\n      open?.()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-13-the-primary-goes-nowhere-under-a-space: the primary needs a project again')
