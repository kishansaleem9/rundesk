# EVERY ITEM IN THE MENU CREATES TWICE: ONE CHOICE, TWO TASKS.
# Reddens: create-task-chevron: "Create and close makes one task, closes the modal and leaves the page where it was, with a toast naming the task and its list"
#   and "Create and open makes one task, closes the modal and opens the new task’s sheet on its list, here a list picked under the space alone"
#   and "Create and start another makes one task from what was typed and leaves the modal open on an empty form, in the same space, project and list"
#   and "Create and duplicate makes one task and leaves the modal open holding the content it was made from, in the same list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                  onSelect={() => create.mutate(item.value)}\n'
b = '                  onSelect={() => { create.mutate(item.value); create.mutate(item.value) }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ctc-11-a-choice-makes-two: each menu item posts the task twice')
