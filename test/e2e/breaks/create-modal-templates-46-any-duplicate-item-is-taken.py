# AN ITEM NO COPY CAN TAKE IS PASSED OVER, and the copy is made.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and with Attachments off the copy takes no file and keeps its subtask, while an item a copy cannot take is refused in words, 400 “Unknown duplicate item: comments”, and no copy is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '    if (!(DUPLICATE_ITEMS as readonly string[]).includes(key)) throw new BadRequestException(`Unknown duplicate item: ${key}`)\n'
b = '    if (!(DUPLICATE_ITEMS as readonly string[]).includes(key)) continue // BROKEN: any duplicate item is taken\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-46-any-duplicate-item-is-taken: an unknown duplicate item is ignored')
