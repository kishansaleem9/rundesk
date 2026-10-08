# THE DUPLICATE DIALOG SENDS NO KEEP CHECKED ITEMS: the box is drawn and the copy is unticked.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and with Keep checked items ticked the copy keeps the ticked item ticked and the other not, and the member who follows the original follows the copy (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/duplicate-task-dialog.tsx'
a = '          <Button onClick={() => onDuplicate(take, keepChecked && take.checklists)} disabled={pending} data-testid="duplicate-confirm">\n'
b = '          <Button onClick={() => onDuplicate(take, false /* BROKEN: no Keep checked items sent */)} disabled={pending} data-testid="duplicate-confirm">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-54-the-dialog-sends-no-keep-checked: the dialog never asks to keep ticks')
