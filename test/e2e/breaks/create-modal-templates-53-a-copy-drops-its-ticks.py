# KEEP CHECKED ITEMS ON A DUPLICATE KEEPS NONE: every item of the copy is unticked.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and with Keep checked items ticked the copy keeps the ticked item ticked and the other not, and the member who follows the original follows the copy (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '    const payload = await this.snapshotTask(taskId, ctx, { keepChecked: take.checklists && dto.keepCheckedItems === true })\n'
b = '    const payload = await this.snapshotTask(taskId, ctx, { keepChecked: false }) // BROKEN: a copy drops its ticks\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-53-a-copy-drops-its-ticks: a duplicate keeps no tick')
