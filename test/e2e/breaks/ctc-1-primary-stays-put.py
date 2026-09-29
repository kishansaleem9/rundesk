# THE PRIMARY CREATE TASK MAKES THE TASK AND STAYS PUT: THE MODAL STAYS OPEN AND NOTHING OPENS.
# Reddens: create-task-chevron: "the primary Create task still makes one task, closes the modal and opens the task on its list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
# RE-AIMED 29 September: the primary now opens the task through `opener`, on a
# list picked under the space alone too (`found-29-sep/primary-create-silent-under-a-space`),
# so the anchor is its close-and-open; the edit is the same, and check 8 reddens with it.
a = "      if (!open) return createdThen(task, 'close')\n      onClose()\n      open()\n"
b = "      if (!open) return createdThen(task, 'close')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-1-primary-stays-put: the primary button neither closes the modal nor opens the task')
