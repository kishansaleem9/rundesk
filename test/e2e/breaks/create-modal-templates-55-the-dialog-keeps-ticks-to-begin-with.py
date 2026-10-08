# THE DUPLICATE DIALOG STARTS WITH KEEP CHECKED ITEMS ON.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "Duplicate in the task sheet asks what the copy takes, nine boxes, watchers and attachments among them, every one ticked to begin with, and Keep checked items, off"
import io
p = '/home/user/rundesk/apps/web/src/components/duplicate-task-dialog.tsx'
a = ('      setTake(ALL)\n'
     '      setKeepChecked(false)\n')
b = ('      setTake(ALL)\n'
     '      setKeepChecked(true) // BROKEN: Keep checked items starts on\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-55-the-dialog-keeps-ticks-to-begin-with: Keep checked items starts ticked in the dialog')
