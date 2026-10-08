# THE DUPLICATE DIALOG’S BOXES START UNTICKED, where ClickUp’s are pre-selected.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates:
#   "Duplicate in the task sheet asks what the copy takes, nine boxes, watchers and attachments among them, every one ticked to begin with, and Keep checked items, off"
#   "with Subtasks unticked, the copy takes the linked file and no subtask (read by SQL)"
#   "and a stored file whose object is gone is left out of the copy and named in a warning, the copy made all the same"
import io
p = '/home/user/rundesk/apps/web/src/components/duplicate-task-dialog.tsx'
a = 'const ALL = Object.fromEntries(DUPLICATE_ITEMS.map((item) => [item, true])) as Record<DuplicateItem, boolean>\n'
b = 'const ALL = Object.fromEntries(DUPLICATE_ITEMS.map((item) => [item, false])) as Record<DuplicateItem, boolean> // BROKEN: the boxes start unticked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-44-the-boxes-start-unticked: every Duplicate box starts unticked')
