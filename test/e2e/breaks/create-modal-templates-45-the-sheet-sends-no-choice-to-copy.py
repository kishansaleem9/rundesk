# THE SHEET’S DUPLICATE SENDS NO CHOICE: the boxes are drawn and the copy takes everything.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "with Subtasks unticked, the copy takes the linked file and no subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '        body: { include, keepCheckedItems },\n'
b = "        body: { keepCheckedItems }, // BROKEN: the sheet's choice is not sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-45-the-sheet-sends-no-choice-to-copy: the sheet duplicates everything whatever is ticked')
