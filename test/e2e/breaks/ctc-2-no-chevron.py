# THE CHEVRON HALF OF CREATE TASK IS NOT DRAWN: A PLAIN BUTTON AGAIN, AS BEFORE THE MENU.
# Reddens: create-task-chevron: "the chevron beside Create task opens, over the modal, a menu of ClickUp’s four: Create and close, Create and open, Create and start another, Create and duplicate"
#   and "Escape closes that menu and leaves the modal open with what was typed in it, having made nothing"
#   and "Create and close makes one task, closes the modal and leaves the page where it was, with a toast naming the task and its list"
#   and "Create and open makes one task, closes the modal and opens the new task’s sheet on its list, here a list picked under the space alone"
#   and "Create and start another makes one task from what was typed and leaves the modal open on an empty form, in the same space, project and list"
#   and "Create and duplicate makes one task and leaves the modal open holding the content it was made from, in the same list"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          <DropdownMenu>\n'
b = '          {false && <DropdownMenu>\n'
c = '          </DropdownMenu>\n'
d = '          </DropdownMenu>}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(c) == 1, f'anchor appears {s.count(c)} times in {p}, expected exactly 1'
s = s.replace(a, b).replace(c, d)
io.open(p, 'w', encoding='utf-8').write(s)
print('ctc-2-no-chevron: Create task has no chevron and no menu')
