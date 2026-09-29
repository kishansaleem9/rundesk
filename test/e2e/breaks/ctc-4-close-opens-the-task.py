# CREATE AND CLOSE OPENS THE TASK INSTEAD, AS THE PRIMARY BUTTON DOES: THE PAGE MOVES AND NOTHING IS SAID.
# Reddens: create-task-chevron: "Create and close makes one task, closes the modal and leaves the page where it was, with a toast naming the task and its list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    if (then === 'open' && open) {\n"
b = "    if ((then === 'open' || then === 'close') && open) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-4-close-opens-the-task: Create and close navigates to the task')
